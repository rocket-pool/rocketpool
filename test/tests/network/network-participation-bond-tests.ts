import assert from 'node:assert/strict';
import { type ContractTransactionReceipt, hexlify, solidityPackedKeccak256 } from 'ethers';
import { before, describe, expectRevert, it, load, type ProtocolCurrent } from '../../harness';
import {
  RocketDAOProtocolSettingsNetwork__factory,
  RocketMinipoolDelegate__factory,
  RocketStorage__factory,
} from '../../harness/bindings/current';
import { RocketNetworkSnapshots__factory } from '../../harness/bindings/v1_4';
import { StorageHelper__factory } from '../../harness/bindings/fixtures';
import {
  currentEpoch,
  currentSlot,
  FAR_FUTURE_EPOCH,
  slotProof,
  validatorProof,
} from '../../scenarios/megapool/proofs';
import { stakeMegapoolValidatorAndAssert } from '../../scenarios/megapool/stake-validator';
import { distributeMinipoolBalanceAndAssert } from '../../scenarios/minipool/distribute-balance';
import { bitmap, challengeTree } from '../../scenarios/network/participation-proofs';
import { rplStakingSnapshot } from '../../scenarios/node/rpl-staking';
import { ethers, network } from '../../../test-old/_utils/hardhat-runtime';

const RPL = 10n ** 18n;
const PERIOD = 44032;
const BOND = 100n * RPL;
const key = (field: string, id?: bigint) => id === undefined
  ? solidityPackedKeccak256(['string'], [`participation.challenge.${field}`])
  : solidityPackedKeccak256(['string', 'uint256'], [`participation.challenge.${field}`, id]);
const setTime = (t: bigint) => network.provider.send('evm_setNextBlockTimestamp', [Number(t)]);
const contract = async (c: ProtocolCurrent, actor = 'proposer') => c.contracts.rocketNetworkParticipation.connect(await c.context.actor(actor));

async function setSetting(c: ProtocolCurrent, name: string, value: bigint | boolean) {
  await c.pdao.bootstrap.setSetting({
    contract: 'rocketDAOProtocolSettingsNetwork', path: `network.performance.${name}`,
    value: typeof value === 'boolean' ? { type: 'bool', value } : { type: 'uint', value },
  });
}

async function getState(c: ProtocolCurrent) {
  const count = await c.contracts.rocketStorage.getUint(key('count'));
  const challenges = await Promise.all(Array.from({ length: Number(count) }, async (_, i) => {
    const id = BigInt(i + 1);
    return {
      bond: Array.from(await c.contracts.rocketNetworkParticipation.getChallengeBondDetails(id)),
      defeated: await c.contracts.rocketStorage.getBool(key('responded', id)),
      finalised: await c.contracts.rocketStorage.getBool(key('finalised', id)),
    };
  }));
  const e = c.contracts.rocketNetworkExit;
  const mini = c.minipools.get('target').address;
  const mega = await c.megapools.address('node');
  const pool = await c.megapools.delegate('node');
  const miniContract = RocketMinipoolDelegate__factory.connect(mini, ethers.provider);
  return {
    count, challenges,
    stake: await Promise.all(['proposer', 'responder', 'responder2', 'megaProposer'].map(n => rplStakingSnapshot(c, n))),
    supply: await c.contracts.rocketTokenRPL.totalSupply(),
    wallets: await Promise.all(['proposer', 'responder', 'responder2', 'megaProposer'].map(n => c.tokens.rplBalance(n))),
    exit: [await e.getRequestedEth(), await e.getVoluntaryEth(), await e.getMinipoolCooperativeExitStart(mini), await e.getMinipoolExpectedUserCapital(mini),
      await e.getMinipoolExitRequestCount(mini), await e.getMinipoolLastExit(mini), await e.getMegapoolCooperativeExitStart(mega, 0n),
      await e.getMegapoolExpectedUserCapital(mega, 0n), await e.getMegapoolExitType(mega, 0n), await e.getMegapoolOutstandingExitCount(mega)],
    validators: [Array.from(await pool.getValidatorInfo(0n)), await miniContract.getStatus(), await miniContract.getFinalised(), await miniContract.getUserDistributed(),
      await pool.getActiveValidatorCount(), await pool.getExitingValidatorCount(), await pool.getLockedValidatorCount()],
    balances: await Promise.all([mini, mega, await e.getAddress(), await c.contracts.rocketNetworkParticipation.getAddress()].map(a => ethers.provider.getBalance(a))),
  };
}

async function rejects(c: ProtocolCurrent, action: () => Promise<unknown>, reason?: string) {
  const before = await getState(c);
  await expectRevert(action, reason);
  assert.deepEqual(await getState(c), before);
}

async function input(c: ProtocolCurrent) {
  return {
    start: await currentEpoch(c) - BigInt(PERIOD), words: bitmap(PERIOD, Array.from({ length: 2642 }, (_, i) => i)),
    timestamp: await c.time.latest(), slot: slotProof(await currentSlot(c)),
  };
}

async function submit(c: ProtocolCurrent, mini = false, actor = 'proposer') {
  const p = await input(c);
  const api = await contract(c, actor);
  return mini ? api.challengeMinipools([c.minipools.get('target').address], p.start, p.words, p.timestamp, p.slot)
    : api.challengeMegapool(await c.megapools.address('node'), [0n], p.start, p.words, p.timestamp, p.slot);
}

function event(c: ProtocolCurrent, receipt: ContractTransactionReceipt, name: string) {
  const matches = receipt.logs.flatMap(log => {
    try {
      const e = c.contracts.rocketNetworkParticipation.interface.parseLog(log);
      return e?.name === name ? [e] : [];
    } catch {
      return [];
    }
  });
  assert.equal(matches.length, 1);
  return matches[0].args.toArray(true);
}

async function challenge(c: ProtocolCurrent, mini = false, actor = 'proposer') {
  const before = await c.contracts.rocketNodeStaking.getNodeLockedRPL(await c.nodes.address(actor));
  const receipt = await (await submit(c, mini, actor)).wait();
  assert(receipt);
  const id = await c.contracts.rocketStorage.getUint(key('count'));
  const details = await c.contracts.rocketNetworkParticipation.getChallengeBondDetails(id);
  assert.deepEqual(event(c, receipt, 'ChallengeBondLocked'), [id, await c.nodes.address(actor), details.bondAmount, details.responseDeadline]);
  assert.equal(await c.contracts.rocketNodeStaking.getNodeLockedRPL(await c.nodes.address(actor)), before + details.bondAmount);
  return {
    id,
    mini,
    actor,
    deadline: details.responseDeadline,
    bond: details.bondAmount,
    start: await c.contracts.rocketStorage.getUint(key('start', id)),
    words: bitmap(PERIOD, Array.from({ length: 2642 }, (_, i) => i)),
  };
}

type Challenge = Awaited<ReturnType<typeof challenge>>;

async function respond(c: ProtocolCurrent, ch: Challenge, actor = 'responder', participation = false) {
  const v = ch.mini ? {
      validatorIndex: 0n, validator: {
        pubkey: c.minipools.get('target').pubkey,
        withdrawalCredentials: `0x010000000000000000000000${c.minipools.get('target').address.slice(2)}`,
        effectiveBalance: 32_000_000_000n,
        slashed: false,
        activationEligibilityEpoch: 0n,
        activationEpoch: ch.start + 1n,
        exitEpoch: FAR_FUTURE_EPOCH,
        withdrawableEpoch: FAR_FUTURE_EPOCH,
      }, witnesses: [] as string[],
    }
    : await validatorProof(c, 'node', 0n, { activationEpoch: ch.start + 1n });
  const timestamp = await c.time.latest();
  const slot = slotProof(await currentSlot(c));
  const api = await contract(c, actor);
  if (!participation) return ch.mini ? api.respondWithMinipoolValidator(ch.id, c.minipools.get('target').address, timestamp, v, slot)
    : api.respondWithMegapoolValidator(ch.id, 0n, timestamp, v, slot);
  const bytes = new Uint8Array(32);
  bytes[0] = 2;
  const p = {
    participationSlot: (ch.start + 1n) * 32n,
    validatorIndex: 0n,
    participationFlagsChunk: hexlify(bytes),
    witnesses: [] as string[],
  };
  const tail = [0n, ch.words[0], challengeTree(ch.words).witness(0n), timestamp, v, p, slot] as const;
  return ch.mini ? api.respondWithMinipoolParticipation(ch.id, c.minipools.get('target').address, ...tail)
    : api.respondWithMegapoolParticipation(ch.id, 0n, ...tail);
}

async function defeat(c: ProtocolCurrent, ch: Challenge, actor = 'responder', participation = false) {
  const before = await getState(c);
  await (await respond(c, ch, actor, participation)).wait();
  const after = await getState(c);
  assert.deepEqual(after.stake, before.stake);
  assert.deepEqual(after.exit, before.exit);
  const details = await c.contracts.rocketNetworkParticipation.getChallengeBondDetails(ch.id);
  assert.equal(details.responder, await c.nodes.address(actor));
  assert.equal(details.settled, false);
}

async function claim(c: ProtocolCurrent, ch: Challenge, actor = 'responder', recovered = ch.bond) {
  const from = await rplStakingSnapshot(c, ch.actor);
  const to = await rplStakingSnapshot(c, actor);
  const supply = await c.tokens.rplSupply();
  const burn = recovered / 5n;
  const reward = recovered - burn;
  const previousBlock = await ethers.provider.getBlockNumber();
  const wallets = [await c.tokens.rplBalance(ch.actor), await c.tokens.rplBalance(actor)];
  const receipt = await (await (await contract(c, actor)).claimChallengeReward(ch.id)).wait();
  assert(receipt);
  assert.deepEqual(event(c, receipt, 'ChallengeBondSettled'), [ch.id, await c.nodes.address(ch.actor), await c.nodes.address(actor), ch.bond, recovered, reward, burn]);
  const afterFrom = await rplStakingSnapshot(c, ch.actor);
  const afterTo = await rplStakingSnapshot(c, actor);
  assert.equal(afterFrom.nodeTotal, from.nodeTotal - recovered);
  assert.equal(afterFrom.locked, from.locked - ch.bond);
  assert.equal(afterTo.nodeTotal, to.nodeTotal + reward);
  assert.equal(afterTo.nodeMega, to.nodeMega + reward);
  assert.equal(afterTo.nodeLegacy, to.nodeLegacy);
  const legacyUsed = from.nodeLegacy < recovered ? from.nodeLegacy : recovered;
  assert.equal(afterFrom.nodeLegacy, from.nodeLegacy - legacyUsed);
  assert.equal(afterFrom.nodeMega, from.nodeMega - (recovered - legacyUsed));
  assert.equal(afterFrom.total, from.total - burn);
  assert.equal(afterFrom.totalLegacy, from.totalLegacy - legacyUsed);
  assert.equal(afterFrom.totalMega, from.totalMega + reward - (recovered - legacyUsed));
  assert.equal(afterFrom.vaultRpl, from.vaultRpl - burn);
  assert.equal(afterFrom.stakingRpl, from.stakingRpl - burn);
  assert.equal(await c.tokens.rplSupply(), supply - burn);
  assert.deepEqual([await c.tokens.rplBalance(ch.actor), await c.tokens.rplBalance(actor)], wallets);
  assert.equal((await c.contracts.rocketNetworkParticipation.getChallengeBondDetails(ch.id)).settled, true);
  const snapshots = RocketNetworkSnapshots__factory.connect(await c.contracts.rocketStorage.getFunction('getAddress')(
    solidityPackedKeccak256(['string', 'string'], ['contract.address', 'rocketNetworkSnapshots'])), ethers.provider);
  for (const [actorName, previous, current] of [[ch.actor, from, afterFrom], [actor, to, afterTo]] as const) {
    const stakeKey = solidityPackedKeccak256(['string', 'address'], ['rpl.staked.node.amount', await c.nodes.address(actorName)]);
    assert.equal(await snapshots.lookup(stakeKey, previousBlock), previous.nodeTotal);
    assert.equal(await snapshots.lookup(stakeKey, receipt.blockNumber), current.nodeTotal);
  }
}

async function release(c: ProtocolCurrent, ch: Challenge) {
  const before = await getState(c);
  const receipt = await (await (await contract(c, 'outsider')).releaseChallengeBond(ch.id)).wait();
  assert(receipt);
  assert.deepEqual(event(c, receipt, 'ChallengeBondReleased'), [ch.id, await c.nodes.address(ch.actor), ch.bond]);
  const after = await getState(c);
  const proposerIndex = ch.actor === 'proposer' ? 0 : 3;
  before.stake[proposerIndex].locked -= ch.bond;
  before.challenges[Number(ch.id - 1n)].bond[4] = true;
  assert.deepEqual(after, before);
}

// Shortfalls are produced by a real minipool withdrawal and its normal RPL slashing path.
async function slashTo(c: ProtocolCurrent, remaining: bigint) {
  const staking = c.contracts.rocketNodeStaking;
  const owner = await c.nodes.address('proposer');
  const stake = await staking.getNodeStakedRPL(owner);
  const price = await c.contracts.rocketNetworkPrices.getRPLPrice();
  const capital = (await c.minipools.details('collateral')).userDepositBalance;
  const loss = remaining === 0n ? stake * price / RPL + RPL : (stake - remaining) * price / RPL;
  assert(capital - loss >= 8n * RPL);
  await distributeMinipoolBalanceAndAssert(c, 'collateral', {
    balance: capital - loss,
    expectedUser: capital - loss,
    expectedNode: 0n,
    expectedFinalised: true,
  });
  assert.equal(await staking.getNodeStakedRPL(owner), remaining);
}

describe('RocketNetworkParticipation bonds', () => {
  before(async () => {
    const old = await load().ensure('1.3.1');
    await old.nodes.register('proposer');
    await old.tokens.mintRpl('proposer', 1000n * RPL);
    await old.nodes.stakeRpl('proposer', 1000n * RPL);
    await old.nodes.register('node');
    await old.nodes.stakeMinimumRpl('node', { minipools: 1, bond: 16n * RPL });
    for (const [name, node] of [['collateral', 'proposer'], ['target', 'node']]) {
      const bond = name === 'collateral' ? 8n * RPL : 16n * RPL;
      await old.depositPool.fund('depositor', 32n * RPL - bond);
      await old.minipools.create(name, { node, bond });
    }
    await old.time.advanceMinipoolScrubPeriod();
    await old.minipools.stake('collateral');
    await old.minipools.stake('target');
    const c = await old.upgradeTo('current');
    for (const name of ['responder', 'responder2', 'megaProposer']) await c.nodes.register(name);
    await c.tokens.mintRpl('megaProposer', 1000n * RPL);
    await c.nodes.stakeRpl('megaProposer', 1000n * RPL);
    await c.nodes.setRplLockingAllowed('proposer', true);
    await c.nodes.setRplLockingAllowed('megaProposer', true);
    await c.megapools.disableProofVerification();
    await c.depositPool.fund('depositor', 28n * RPL);
    await c.megapools.deposit('node');
    await stakeMegapoolValidatorAndAssert(c, 'node', 0n);
    await c.context.actor('outsider');
  });

  it('initialises fresh and upgraded bond settings and enforces the pDAO guardrail', async () => {
    const c = await load().ensure('current');
    const api = c.contracts.rocketDAOProtocolSettingsNetwork;
    assert.equal(await api.getPerformanceChallengeBond(), BOND);
    const signer = await c.context.guardian();
    const storage = await new RocketStorage__factory(signer).deploy();
    await storage.waitForDeployment();
    const fresh = await new RocketDAOProtocolSettingsNetwork__factory(signer).deploy(String(storage.target));
    await fresh.waitForDeployment();
    assert.equal(await fresh.getPerformanceChallengeBond(), BOND);
    for (const bad of [0n, 20n * RPL - 1n, 20n * RPL]) await rejects(c, () => setSetting(c, 'challenge.bond', bad), 'Value must be > 20 RPL');
    await setSetting(c, 'challenge.bond', 20n * RPL + 1n);
    assert.equal(await api.getPerformanceChallengeBond(), 20n * RPL + 1n);
    await rejects(c, async () => api.connect(await c.context.actor('outsider')).setSettingUint('network.performance.challenge.bond', BOND));
    assert.equal(await c.contracts.rocketStorage.getBool(solidityPackedKeccak256(['string', 'string', 'string'], ['dao.security.allowed.setting', 'network', 'network.performance.challenge.bond'])), false);
  });

  for (const mini of [false, true]) {
    const kind = mini ? 'minipool' : 'megapool';
    it(`locks a separate bond for each overlapping ${kind} list without altering stake or voting`, async () => {
      const c = await load().ensure('current');
      const before = await getState(c);
      const block = BigInt(await ethers.provider.getBlockNumber());
      const power = await c.network.voting.power('proposer', block);
      const a = await challenge(c, mini);
      const b = await challenge(c, mini);
      const after = await getState(c);
      before.stake[0].locked += 2n * BOND;
      assert.deepEqual(after.stake, before.stake);
      assert.equal(after.supply, before.supply);
      assert.equal(await c.network.voting.power('proposer', BigInt(await ethers.provider.getBlockNumber())), power);
      assert.notEqual(a.id, b.id);
    });

    for (const bad of ['unregistered', 'disabled locking', 'insufficient', 'unstaking'] as const) it(`rejects ${bad} ${kind} bond funding atomically`, async () => {
      const c = await load().ensure('current');
      let actor = 'proposer';
      let reason = 'Not enough staked RPL';
      if (bad === 'unregistered') {
        actor = 'outsider';
        reason = 'Invalid node';
      }
      if (bad === 'disabled locking') {
        await c.nodes.setRplLockingAllowed(actor, false);
        reason = 'Node is not allowed to lock RPL';
      }
      if (bad === 'insufficient') await setSetting(c, 'challenge.bond', 1001n * RPL);
      if (bad === 'unstaking') {
        actor = 'megaProposer';
        await c.nodes.unstakeRpl(actor, 1000n * RPL);
      }
      await rejects(c, () => submit(c, mini, actor), reason);
    });

    for (const participation of [false, true]) it(`restricts ${kind} ${participation ? 'participation' : 'activation'} responses to other registered nodes`, async () => {
      const c = await load().ensure('current');
      const ch = await challenge(c, mini);
      await rejects(c, () => respond(c, ch, 'outsider', participation), 'Invalid node');
      await rejects(c, () => respond(c, ch, 'proposer', participation), 'Cannot defeat own challenge');
      assert.equal(await c.contracts.rocketNodeStaking.getNodeStakedRPL(await c.nodes.address('responder')), 0n);
      assert.equal(await c.contracts.rocketNodeStaking.getRPLLockingAllowed(await c.nodes.address('responder')), false);
      await defeat(c, ch, 'responder', participation);
      await rejects(c, () => respond(c, ch, 'responder2', participation), 'Challenge was defeated');
    });

    it(`pays a funded ${kind} reward as stake and burns twenty percent immediately after defeat`, async () => {
      const c = await load().ensure('current');
      const ch = await challenge(c, mini);
      await defeat(c, ch);
      await rejects(c, async () => (await contract(c)).claimChallengeReward(ch.id), 'Invalid responder');
      await rejects(c, async () => (await contract(c, 'outsider')).claimChallengeReward(ch.id), 'Invalid node');
      await rejects(c, async () => (await contract(c)).releaseChallengeBond(ch.id), 'Challenge was defeated');
      await setSetting(c, 'exits.enabled', false);
      await setSetting(c, 'challenge.bond', 200n * RPL);
      await claim(c, ch);
      await rejects(c, async () => (await contract(c, 'responder')).claimChallengeReward(ch.id), 'Bond already settled');
    });

    it(`releases an undefeated ${kind} bond independently at its snapshotted deadline`, async () => {
      const c = await load().ensure('current');
      const ch = await challenge(c, mini);
      await rejects(c, async () => (await contract(c, 'responder')).claimChallengeReward(ch.id), 'Challenge was not defeated');
      await setSetting(c, 'challenge.bond', 200n * RPL);
      await setSetting(c, 'challenge.period', 172800n);
      const newer = await challenge(c, mini);
      assert.equal(newer.bond, 200n * RPL);
      assert(newer.deadline > ch.deadline);
      await setTime(ch.deadline);
      await rejects(c, async () => (await contract(c, 'outsider')).releaseChallengeBond(ch.id), 'Challenge period has not passed');
      await setTime(ch.deadline + 1n);
      await release(c, ch);
      await rejects(c, () => respond(c, ch), 'Challenge period has passed');
      await setSetting(c, 'exits.enabled', false);
      await (await (await contract(c, 'outsider')).finaliseChallenge(ch.id)).wait();
      assert.equal((await c.contracts.rocketNetworkParticipation.getChallengeBondDetails(newer.id)).settled, false);
      await rejects(c, async () => (await contract(c)).releaseChallengeBond(ch.id), 'Bond already settled');
    });

    it(`keeps ${kind} response and finalization boundaries when the setting is shortened`, async () => {
      const c = await load().ensure('current');
      const ch = await challenge(c, mini);
      await setSetting(c, 'challenge.period', 1n);
      await rejects(c, async () => (await contract(c)).finaliseChallenge(ch.id), 'Not enough time has passed');
      await c.time.advance(ch.deadline - await c.time.latest() - 10n);
      await setTime(ch.deadline);
      await defeat(c, ch);
    });

    it(`releases after ${kind} finalization and after an all-skipped overlapping list`, async () => {
      const c = await load().ensure('current');
      const a = await challenge(c, mini);
      const b = await challenge(c, mini);
      await setTime(b.deadline + 1n);
      await (await (await contract(c, 'outsider')).finaliseChallenge(a.id)).wait();
      await (await (await contract(c, 'outsider')).finaliseChallenge(b.id)).wait();
      await setSetting(c, 'exits.enabled', false);
      await release(c, a);
      await release(c, b);
    });
  }

  for (const remaining of [50n * RPL, 0n]) it(`settles a bond after real minipool slashing leaves ${remaining / RPL} RPL`, async () => {
    const c = await load().ensure('current');
    const ch = await challenge(c);
    await slashTo(c, remaining);
    await defeat(c, ch);
    await claim(c, ch, 'responder', remaining);
    await c.tokens.mintRpl('proposer', BOND);
    await c.nodes.stakeRpl('proposer', BOND);
    await rejects(c, async () => (await contract(c, 'responder')).claimChallengeReward(ch.id), 'Bond already settled');
  });

  for (const reverse of [false, true]) it(`settles two underfunded bonds in ${reverse ? 'reverse' : 'submission'} claim order`, async () => {
    const c = await load().ensure('current');
    const a = await challenge(c);
    const b = await challenge(c, true);
    await slashTo(c, 150n * RPL);
    await defeat(c, a);
    await defeat(c, b, 'responder2');
    const pairs = reverse ? [[b, 'responder2'], [a, 'responder']] as const : [[a, 'responder'], [b, 'responder2']] as const;
    await claim(c, pairs[0][0], pairs[0][1]);
    await claim(c, pairs[1][0], pairs[1][1], 50n * RPL);
  });

  it('settles an exhausted later claim and releases locks exceeding the remaining stake', async () => {
    const c = await load().ensure('current');
    const a = await challenge(c);
    const b = await challenge(c);
    const expired = await challenge(c, true);
    await slashTo(c, 50n * RPL);
    await defeat(c, a);
    await defeat(c, b, 'responder2');
    await claim(c, a, 'responder', 50n * RPL);
    await claim(c, b, 'responder2', 0n);
    await setTime(expired.deadline + 1n);
    await release(c, expired);
  });

  for (const remaining of [1n, 7n]) it(`rounds burn down when only ${remaining} wei of legacy stake remain`, async () => {
    const c = await load().ensure('current');
    // Leave a sub-RPL residue through normal unstaking, then slash whole RPL at the oracle precision.
    await c.nodes.unstakeLegacyRpl('proposer', 1n * RPL - remaining);
    const ch = await challenge(c);
    await slashTo(c, remaining);
    await defeat(c, ch);
    await claim(c, ch, 'responder', remaining);
  });

  for (const remaining of [50n * RPL, 0n]) it(`releases the original lock after slashing leaves ${remaining / RPL} RPL`, async () => {
    const c = await load().ensure('current');
    const ch = await challenge(c);
    await slashTo(c, remaining);
    await setTime(ch.deadline + 1n);
    await release(c, ch);
  });

  it('reuses shared governance locks and preserves the existing legacy collateral overlap', async () => {
    const c = await load().ensure('current');
    const controller = await c.context.fixtures.rplStakeController.deploy('governance-lock');
    await controller.lock('proposer', 100n * RPL);
    const ch = await challenge(c);
    await setSetting(c, 'challenge.bond', 801n * RPL);
    await rejects(c, () => submit(c), 'Not enough staked RPL');
    const minimum = await c.contracts.rocketNodeStaking.getNodeMinimumLegacyRPLStake(await c.nodes.address('proposer'));
    const remaining = minimum > 200n * RPL ? minimum : 200n * RPL;
    await c.nodes.unstakeLegacyRpl('proposer', 1000n * RPL - remaining);
    assert.equal(await c.contracts.rocketNodeStaking.getNodeStakedRPL(await c.nodes.address('proposer')), remaining);
    await setTime(ch.deadline + 1n);
    await release(c, ch);
    assert.equal(await c.contracts.rocketNodeStaking.getNodeLockedRPL(await c.nodes.address('proposer')), 100n * RPL);
  });

  it('pays rewards from megapool stake without changing legacy stake', async () => {
    const c = await load().ensure('current');
    const ch = await challenge(c, false, 'megaProposer');
    await defeat(c, ch);
    await claim(c, ch);
  });

  it('settles across legacy and megapool stake after slashing and a top-up', async () => {
    const c = await load().ensure('current');
    const ch = await challenge(c);
    await slashTo(c, 50n * RPL);
    await c.tokens.mintRpl('proposer', 100n * RPL);
    await c.nodes.stakeRpl('proposer', 100n * RPL);
    await defeat(c, ch);
    await claim(c, ch);
  });

  it('keeps performance bonds locked through normal megapool unstaking', async () => {
    const c = await load().ensure('current');
    const ch = await challenge(c, false, 'megaProposer');
    await rejects(c, () => c.nodes.unstakeRpl('megaProposer', 901n * RPL), 'Insufficient RPL stake to reduce');
    await c.nodes.unstakeRpl('megaProposer', 900n * RPL);
    const stake = await rplStakingSnapshot(c, 'megaProposer');
    assert.equal(stake.nodeTotal, BOND);
    assert.equal(stake.locked, BOND);
    assert.equal(stake.unstaking, 900n * RPL);
    await setTime(ch.deadline + 1n);
    await release(c, ch);
    await c.nodes.unstakeRpl('megaProposer', BOND);
    assert.equal(await c.contracts.rocketNodeStaking.getNodeStakedRPL(await c.nodes.address('megaProposer')), 0n);
  });

  it('rolls back unlock, stake reduction and settlement if the vault payout fails', async () => {
    const c = await load().ensure('current');
    const ch = await challenge(c);
    await defeat(c, ch);
    const fixture = await c.context.fixtures.storage.deploy('bond-vault-fault');
    const helper = StorageHelper__factory.connect(fixture.address, await c.context.guardian());
    const nameKey = solidityPackedKeccak256(['string', 'address'], ['contract.name', await c.contracts.rocketNodeStaking.getAddress()]);
    await helper.setString(nameKey, 'unfunded-test-contract');
    const block = await ethers.provider.getBlockNumber();
    await rejects(c, async () => (await contract(c, 'responder')).claimChallengeReward(ch.id, { gasLimit: 3_000_000n }));
    assert.equal((await c.contracts.rocketNetworkParticipation.queryFilter(c.contracts.rocketNetworkParticipation.filters.ChallengeBondSettled(), block + 1)).length, 0);
    assert.equal((await c.contracts.rocketNodeStaking.queryFilter(c.contracts.rocketNodeStaking.filters.RPLUnlocked(), block + 1)).length, 0);
    await helper.setString(nameKey, 'rocketNodeStaking');
    await claim(c, ch);
  });

  it('rejects nonexistent bonds and mutations through an outdated Participation instance', async () => {
    const c = await load().ensure('current');
    await rejects(c, async () => (await contract(c)).getChallengeBondDetails(999n), 'Invalid challenge');
    await rejects(c, async () => (await contract(c)).releaseChallengeBond(999n), 'Invalid challenge');
    await rejects(c, async () => (await contract(c, 'responder')).claimChallengeReward(999n), 'Invalid challenge');
    const ch = await challenge(c);
    const mini = await challenge(c, true);
    const fixture = await c.context.fixtures.storage.deploy('outdated-participation');
    const helper = StorageHelper__factory.connect(fixture.address, await c.context.guardian());
    await helper.setAddress(solidityPackedKeccak256(['string', 'string'], ['contract.address', 'rocketNetworkParticipation']), await c.nodes.address('outsider'));
    for (const action of [() => submit(c), () => submit(c, true), () => respond(c, ch), () => respond(c, ch, 'responder', true),
      () => respond(c, mini), () => respond(c, mini, 'responder', true), async () => (await contract(c)).releaseChallengeBond(ch.id),
      async () => (await contract(c, 'responder')).claimChallengeReward(ch.id), async () => (await contract(c)).finaliseChallenge(ch.id)]) {
      await rejects(c, action, 'Invalid or outdated contract');
    }
  });
});
