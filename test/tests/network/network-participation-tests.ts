import {
  assertParticipationBondLocked,
  participationBondAccounting,
  prepareParticipationBonds,
} from '../../scenarios/network/participation-bonds';
import assert from 'node:assert/strict';
import {
  AbiCoder,
  type ContractTransactionResponse,
  getBytes,
  hexlify,
  solidityPackedKeccak256,
  toBeHex,
  ZeroHash,
} from 'ethers';
import { asNetworkContract, before, describe, expectRevert, it, load, type ProtocolCurrent } from '../../harness';
import { WithdrawalRequestPredeployMock__factory } from '../../harness/bindings/fixtures';
import {
  currentEpoch,
  currentSlot,
  FAR_FUTURE_EPOCH,
  slotProof,
  validatorProof,
  withdrawalProof,
} from '../../scenarios/megapool/proofs';
import { stakeMegapoolValidatorAndAssert } from '../../scenarios/megapool/stake-validator';
import { notifyMegapoolExitAndAssert } from '../../scenarios/megapool/notify-exit';
import { finaliseMegapoolValidatorAndAssert } from '../../scenarios/megapool/finalise-validator';
import { beaconProofs, bitmap, challengeTree } from '../../scenarios/network/participation-proofs';
import {
  bootstrapSecurityMemberAndAssert,
  executeSecurityProposalAndAssert,
  proposeSecuritySettingAndAssert,
  voteSecurityProposalAndAssert,
} from '../../scenarios/pdao/security';
import { prepareMegapoolProtocol } from '../megapool/fixtures';
import { ethers, network } from '../../../test-old/_utils/hardhat-runtime';

const ETH = 10n ** 18n;
const PERIOD = 44032;
const PREDEPLOY = '0x00000961Ef480Eb55e80D19ad83579A64c007002';
const range = (count: number, start = 0) => Array.from({ length: count }, (_, i) => i + start);
const key = (field: string, id?: bigint) => id === undefined
  ? solidityPackedKeccak256(['string'], [`participation.challenge.${field}`])
  : solidityPackedKeccak256(['string', 'uint256'], [`participation.challenge.${field}`, id]);

async function setTime(timestamp: bigint) {
  await network.provider.send('evm_setNextBlockTimestamp', [Number(timestamp)]);
}

async function setSetting(current: ProtocolCurrent, name: string, value: bigint | boolean) {
  await current.pdao.bootstrap.setSetting({
    contract: 'rocketDAOProtocolSettingsNetwork', path: `network.performance.${name}`,
    value: typeof value === 'boolean' ? { type: 'bool', value } : { type: 'uint', value },
  });
}

async function participant(current: ProtocolCurrent, actor = 'responder') {
  return current.contracts.rocketNetworkParticipation.connect(await current.context.actor(actor));
}

async function predeploy(current: ProtocolCurrent) {
  return WithdrawalRequestPredeployMock__factory.connect(PREDEPLOY, await current.context.actor('finaliser'));
}

async function getExitState(current: ProtocolCurrent) {
  const pool = await current.megapools.delegate('node');
  const address = await pool.getAddress();
  const exit = current.contracts.rocketNetworkExit;
  const count = Number(await pool.getValidatorCount());
  const validators = await Promise.all(range(count).map(async id => ({
    info: Array.from(await pool.getValidatorInfo(id)),
    type: await exit.getMegapoolExitType(address, id),
    timer: await exit.getMegapoolCooperativeExitStart(address, id),
    expected: await exit.getMegapoolExpectedUserCapital(address, id),
  })));
  const addresses = [address, await exit.getAddress(), await current.contracts.rocketNetworkParticipation.getAddress(),
    await current.contracts.rocketDepositPool.getAddress(), await current.contracts.rocketTokenRETH.getAddress(), PREDEPLOY];
  return {
    validators, active: await pool.getActiveValidatorCount(), exiting: await pool.getExitingValidatorCount(),
    locked: await pool.getLockedValidatorCount(), debt: await pool.getDebt(), bond: await pool.getNodeBond(),
    queuedBond: await pool.getNodeQueuedBond(), refund: await pool.getRefundValue(),
    requested: await exit.getRequestedEth(), voluntary: await exit.getVoluntaryEth(),
    outstanding: await exit.getMegapoolOutstandingExitCount(address),
    balances: await Promise.all(addresses.map(a => ethers.provider.getBalance(a))),
    requests: await (await predeploy(current)).requestCount(),
  };
}

async function challengeState(current: ProtocolCurrent) {
  const storage = current.contracts.rocketStorage;
  const count = await storage.getUint(key('count'));
  const challenges = await Promise.all(range(Number(count)).map(async i => {
    const id = BigInt(i + 1);
    return {
      root: await storage.getBytes32(key('root', id)),
      address: await storage.getFunction('getAddress')(key('address', id)),
      validatorIds: Array.from(await current.contracts.rocketNetworkParticipation.getChallengeValidatorIds(id)),
      start: await storage.getUint(key('start', id)),
      period: await storage.getUint(key('period', id)),
      time: await storage.getUint(key('time', id)),
      defeated: await storage.getBool(key('responded', id)),
      finalised: await storage.getBool(key('finalised', id)),
      bond: Array.from(await current.contracts.rocketNetworkParticipation.getChallengeBondDetails(id)),
    };
  }));
  return { count, challenges };
}

async function rejects(current: ProtocolCurrent, action: () => Promise<unknown>, reason?: string) {
  const before = {
    challenges: await challengeState(current),
    exit: await getExitState(current),
    bonds: await participationBondAccounting(current),
  };
  await expectRevert(action, reason);
  assert.deepEqual({
    challenges: await challengeState(current),
    exit: await getExitState(current),
    bonds: await participationBondAccounting(current),
  }, before);
}

async function submission(current: ProtocolCurrent, options: {
  validatorId?: bigint; validatorIds?: bigint[]; address?: string; start?: bigint; words?: bigint[]; timestamp?: bigint;
  proof?: { slot: bigint; witnesses: string[] };
} = {}) {
  const period = await current.contracts.rocketDAOProtocolSettingsNetwork.getPerformancePeriod();
  const epoch = await currentEpoch(current);
  return [options.address ?? await current.megapools.address('node'), options.validatorIds ?? [options.validatorId ?? 0n],
    options.start ?? epoch - period, options.words ?? bitmap(Number(period), range(2642)),
    options.timestamp ?? await current.time.latest(), options.proof ?? slotProof(await currentSlot(current))] as const;
}

async function challenge(current: ProtocolCurrent, options: Parameters<typeof submission>[1] = {}) {
  const args = await submission(current, options);
  const contract = current.contracts.rocketNetworkParticipation.connect(await current.context.actor('proposer'));
  const beforeExit = await getExitState(current);
  const beforeBond = await participationBondAccounting(current);
  const previousCount = (await challengeState(current)).count;
  const tx = await contract.challengeMegapool(...args);
  const receipt = await tx.wait();
  assert(receipt);
  const event = receipt.logs.map(log => {
    try {
      return contract.interface.parseLog(log);
    } catch {
      return null;
    }
  })
    .find(log => log?.name === 'MegapoolChallenged');
  assert(event);
  const id = previousCount + 1n;
  const tree = challengeTree(args[3]);
  assert.equal(event.args[0], args[0]);
  assert.deepEqual(Array.from(event.args[1]), args[1]);
  assert.equal(event.args[2], id);
  assert.equal(event.args[3], args[2]);
  assert.equal(event.args[4], tree.root);
  assert.deepEqual(Array.from(event.args[5]), args[3]);
  const state = await challengeState(current);
  const stored = state.challenges[Number(id - 1n)];
  const time = BigInt((await ethers.provider.getBlock(receipt.blockNumber))!.timestamp);
  assert.equal(state.count, id);
  assert.deepEqual(stored, {
    root: tree.root,
    address: args[0],
    validatorIds: args[1],
    start: args[2],
    period: await current.contracts.rocketDAOProtocolSettingsNetwork.getPerformancePeriod(),
    time,
    defeated: false,
    finalised: false,
    bond: [await current.nodes.address('proposer'), ethers.ZeroAddress, await current.contracts.rocketDAOProtocolSettingsNetwork.getPerformanceChallengeBond(), time + await current.contracts.rocketDAOProtocolSettingsNetwork.getPerformanceChallengePeriod(), false],
  });
  assert.deepEqual(await getExitState(current), beforeExit);
  await assertParticipationBondLocked(current, id, beforeBond);
  return { id, start: args[2], words: args[3], validatorId: args[1][0], validatorIds: args[1], time };
}

type Challenge = Awaited<ReturnType<typeof challenge>>;

async function participationArgs(current: ProtocolCurrent, c: Challenge, offset = 0, flags = 2) {
  const proof = await validatorProof(current, 'node', c.validatorId, { activationEpoch: 0n });
  const chunk = new Uint8Array(32);
  chunk[Number(proof.validatorIndex % 32n)] = flags;
  return [c.id, c.validatorId, BigInt(offset), c.words[Math.floor(offset / 256)], challengeTree(c.words).witness(BigInt(Math.floor(offset / 256))),
    await current.time.latest(), proof,
    {
      participationSlot: (c.start + BigInt(offset) + 1n) * 32n, validatorIndex: proof.validatorIndex,
      participationFlagsChunk: hexlify(chunk), witnesses: [] as string[],
    }, slotProof(await currentSlot(current))] as const;
}

async function activationArgs(current: ProtocolCurrent, c: Challenge, activation = c.start + 1n) {
  return [c.id, c.validatorId, await current.time.latest(), await validatorProof(current, 'node', c.validatorId, {
    activationEpoch: activation, withdrawableEpoch: FAR_FUTURE_EPOCH,
  }), slotProof(await currentSlot(current))] as const;
}

async function assertDefeated(current: ProtocolCurrent, id: bigint, action: () => Promise<ContractTransactionResponse>) {
  const beforeExit = await getExitState(current);
  const receipt = await (await action()).wait();
  assert(receipt);
  const contract = await participant(current);
  const events = receipt.logs.map(log => {
    try {
      return contract.interface.parseLog(log);
    } catch {
      return null;
    }
  })
    .filter(log => log?.name === 'MegapoolChallengeDefeated');
  assert.equal(events.length, 1);
  assert.equal(events[0]!.args[0], id);
  assert.equal(await current.contracts.rocketStorage.getBool(key('responded', id)), true);
  assert.deepEqual(await getExitState(current), beforeExit);
  await rejects(current, () => contract.finaliseChallenge(id), 'Challenge was defeated');
}

async function finalise(current: ProtocolCurrent, c: Challenge, options: { gasLimit?: bigint } = {}) {
  const contract = current.contracts.rocketNetworkParticipation.connect(await current.context.actor('finaliser'));
  const earliest = (await current.contracts.rocketNetworkParticipation.getChallengeBondDetails(c.id)).responseDeadline + 1n;
  if (await current.time.latest() < earliest) await setTime(earliest);
  const receipt = await (await contract.finaliseChallenge(c.id, options)).wait();
  assert(receipt);
  return receipt;
}

describe('RocketNetworkParticipation', () => {
  before(async () => {
    const current = await prepareMegapoolProtocol();
    await prepareParticipationBonds(current);
    for (const name of ['proposer', 'responder', 'finaliser']) await current.context.actor(name);
    const signer = await current.context.actor('finaliser');
    const mock = await new WithdrawalRequestPredeployMock__factory(signer).deploy();
    await mock.waitForDeployment();
    await network.provider.send('hardhat_setCode', [PREDEPLOY, await ethers.provider.getCode(await mock.getAddress())]);
    await (await (await predeploy(current)).reset()).wait();
    await (await (await predeploy(current)).setFee(1n)).wait();
    await current.depositPool.fund('depositor', 56n * ETH);
    for (const id of [0n, 1n]) {
      await current.megapools.deposit('node');
      await stakeMegapoolValidatorAndAssert(current, 'node', id);
    }
    assert.equal(await (await current.megapools.delegate('node')).getDebt(), 0n);
  });

  it('initialises the five implemented settings through the upgrade', async () => {
    const s = (await load().ensure('current')).contracts.rocketDAOProtocolSettingsNetwork;
    assert.deepEqual(await Promise.all([s.getPerformanceExitsEnabled(), s.getPerformancePeriod(), s.getPerformanceProofBuffer(),
      s.getPerformanceThreshold(), s.getPerformanceChallengePeriod()]), [true, 44032n, 225n, 94n * ETH / 100n, 86400n]);
  });

  it('rejects proof buffers from zero through ten epochs without changing the setting', async () => {
    const current = await load().ensure('current');
    const settings = current.contracts.rocketDAOProtocolSettingsNetwork;
    const original = await settings.getPerformanceProofBuffer();
    assert.equal(original, 225n);
    for (let buffer = 0n; buffer <= 10n; buffer++) {
      await expectRevert(() => setSetting(current, 'proof.buffer', buffer), 'Value must be > 10');
      assert.equal(await settings.getPerformanceProofBuffer(), original);
    }
  });

  it('accepts the minimum proof buffer of eleven epochs and the default of 225', async () => {
    const current = await load().ensure('current');
    for (const buffer of [11n, 225n]) {
      await setSetting(current, 'proof.buffer', buffer);
      assert.equal(await current.contracts.rocketDAOProtocolSettingsNetwork.getPerformanceProofBuffer(), buffer);
    }
  });

  it('submits a permissionless challenge with the default bitmap and no exit side effects', async () => {
    const c = await challenge(await load().ensure('current'));
    assert.equal(c.words.length, 172);
    assert.equal(challengeTree(c.words).witness(0n).length, 8);
  });

  it('applies changed pDAO parameters to a new challenge', async () => {
    const current = await load().ensure('current');
    await setSetting(current, 'period', 513n);
    await setSetting(current, 'proof.buffer', 11n);
    await setSetting(current, 'threshold', 9n * ETH / 10n);
    await setSetting(current, 'challenge.period', 120n);
    const start = await currentEpoch(current) - 513n - 11n + 1n;
    const contract = await participant(current, 'proposer');
    await rejects(current, async () => contract.challengeMegapool(...await submission(current, {
      start: start - 1n,
      words: bitmap(513, range(52)),
    })), 'Challenge too recent');
    await rejects(current, async () => contract.challengeMegapool(...await submission(current, {
      start,
      words: bitmap(513, range(51)),
    })), 'Participation is above requirement');
    const c = await challenge(current, { start, words: bitmap(513, range(52)) });
    await setTime(c.time + 120n);
    await rejects(current, () => contract.finaliseChallenge(c.id), 'Not enough time has passed');
    await finalise(current, c);
  });

  it('rejects unauthorized setting writes and respects pDAO disable and re-enable', async () => {
    const current = await load().ensure('current');
    const settings = current.contracts.rocketDAOProtocolSettingsNetwork.connect(await current.context.actor('proposer'));
    await expectRevert(() => settings.setSettingUint('network.performance.period', 100n));
    await expectRevert(() => settings.setSettingBool('network.performance.exits.enabled', false));
    await setSetting(current, 'exits.enabled', false);
    await rejects(current, async () => (await participant(current, 'proposer')).challengeMegapool(...await submission(current)), 'Performance exits disabled');
    await setSetting(current, 'exits.enabled', true);
    await challenge(current);
  });

  it('lets the Security Council disable and re-enable challenges immediately after quorum', async () => {
    const current = await load().ensure('current');
    for (const member of ['securityMember1', 'securityMember2', 'securityMember3']) {
      await bootstrapSecurityMemberAndAssert(current, member, { id: member });
    }
    for (const enabled of [false, true]) {
      const id = await proposeSecuritySettingAndAssert(current, {
        message: 'Set performance exits', caller: 'securityMember1',
        namespace: 'network', path: 'network.performance.exits.enabled', value: enabled,
      });
      await voteSecurityProposalAndAssert(current, id, true, { caller: 'securityMember1' });
      await voteSecurityProposalAndAssert(current, id, true, { caller: 'securityMember2' });
      const quorumTime = await current.time.latest();
      await executeSecurityProposalAndAssert(current, id, { caller: 'securityMember3' });
      assert(await current.time.latest() - quorumTime <= 1n, 'Council execution introduced a timelock');
      assert.equal(await current.contracts.rocketDAOProtocolSettingsNetwork.getPerformanceExitsEnabled(), enabled);
      if (!enabled) await rejects(current, async () => (await participant(current, 'proposer')).challengeMegapool(...await submission(current)), 'Performance exits disabled');
    }
    await challenge(current);
  });

  describe('when performance exits are disabled', () => {
    async function toggleWithoutChangingChallenges(current: ProtocolCurrent, enabled: boolean) {
      const before = {
        challenges: await challengeState(current),
        exit: await getExitState(current),
        bonds: await participationBondAccounting(current),
      };
      await setSetting(current, 'exits.enabled', enabled);
      assert.equal(await current.contracts.rocketDAOProtocolSettingsNetwork.getPerformanceExitsEnabled(), enabled);
      assert.deepEqual({
        challenges: await challengeState(current),
        exit: await getExitState(current),
        bonds: await participationBondAccounting(current),
      }, before);
    }

    for (const response of ['participation', 'activation'] as const) {
      it(`allows an outstanding ${response} response at its original deadline while disabled`, async () => {
        const current = await load().ensure('current');
        const c = await challenge(current);
        const deadline = c.time + await current.contracts.rocketDAOProtocolSettingsNetwork.getPerformanceChallengePeriod();
        await toggleWithoutChangingChallenges(current, false);
        await rejects(current, async () => (await participant(current, 'proposer')).challengeMegapool(...await submission(current)), 'Performance exits disabled');
        await current.time.advance(deadline - await current.time.latest() - 10n);
        const responder = current.contracts.rocketNetworkParticipation.connect(await current.context.actor('responder'));
        const activation = await activationArgs(current, c);
        const participation = await participationArgs(current, c);
        await setTime(deadline);
        await assertDefeated(current, c.id, () => response === 'activation'
          ? responder.respondWithMegapoolValidator(...activation)
          : responder.respondWithMegapoolParticipation(...participation));
        assert.equal(await current.contracts.rocketDAOProtocolSettingsNetwork.getPerformanceExitsEnabled(), false);
      });

      it(`does not extend the ${response} response deadline across disable and re-enable`, async () => {
        const current = await load().ensure('current');
        const c = await challenge(current);
        const deadline = c.time + await current.contracts.rocketDAOProtocolSettingsNetwork.getPerformanceChallengePeriod();
        await toggleWithoutChangingChallenges(current, false);
        await current.time.advance(3600n);
        await toggleWithoutChangingChallenges(current, true);
        await current.time.advance(deadline - await current.time.latest() - 10n);
        const responder = current.contracts.rocketNetworkParticipation.connect(await current.context.actor('responder'));
        const activation = await activationArgs(current, c);
        const participation = await participationArgs(current, c);
        await setTime(deadline + 1n);
        await rejects(current, () => response === 'activation'
          ? responder.respondWithMegapoolValidator(...activation)
          : responder.respondWithMegapoolParticipation(...participation), 'Challenge period has passed');
      });
    }

    it('finalises an outstanding challenge after its original deadline while disabled', async () => {
      const current = await load().ensure('current');
      const c = await challenge(current);
      const deadline = c.time + await current.contracts.rocketDAOProtocolSettingsNetwork.getPerformanceChallengePeriod();
      await toggleWithoutChangingChallenges(current, false);
      const finaliser = current.contracts.rocketNetworkParticipation.connect(await current.context.actor('finaliser'));
      await setTime(deadline);
      await rejects(current, () => finaliser.finaliseChallenge(c.id), 'Not enough time has passed');
      await finalise(current, c);
      const state = await getExitState(current);
      assert.equal(state.validators[0].type, 1n);
      assert.equal(state.validators[0].timer, deadline + 1n);
      assert.equal(state.validators[0].expected, 28n * ETH);
      assert.equal(state.requested, 28n * ETH);
      assert.equal(state.outstanding, 1n);
      assert.equal(state.exiting, 0n);
      assert.equal(state.requests, 0n);
      assert.equal(await current.contracts.rocketDAOProtocolSettingsNetwork.getPerformanceExitsEnabled(), false);
      await rejects(current, () => finaliser.finaliseChallenge(c.id), 'Challenge already finalised');
    });

    it('preserves live and defeated challenges and the finalization deadline across disable and re-enable', async () => {
      const current = await load().ensure('current');
      const live = await challenge(current);
      const defeated = await challenge(current, { validatorId: 1n });
      const responder = current.contracts.rocketNetworkParticipation.connect(await current.context.actor('responder'));
      const args = await activationArgs(current, defeated);
      await assertDefeated(current, defeated.id, () => responder.respondWithMegapoolValidator(...args));
      await toggleWithoutChangingChallenges(current, false);
      await current.time.advance(3600n);
      await toggleWithoutChangingChallenges(current, true);
      const finaliser = current.contracts.rocketNetworkParticipation.connect(await current.context.actor('finaliser'));
      await rejects(current, () => finaliser.finaliseChallenge(defeated.id), 'Challenge was defeated');
      const deadline = live.time + await current.contracts.rocketDAOProtocolSettingsNetwork.getPerformanceChallengePeriod();
      await setTime(deadline);
      await rejects(current, () => finaliser.finaliseChallenge(live.id), 'Not enough time has passed');
      await finalise(current, live);
      assert.equal((await getExitState(current)).requested, 28n * ETH);
      assert.equal(await current.contracts.rocketNetworkExit.getMegapoolCooperativeExitStart(
        await current.megapools.address('node'), live.validatorId), deadline + 1n);
      await rejects(current, () => finaliser.finaliseChallenge(defeated.id), 'Challenge was defeated');
    });
  });

  for (const state of ['unregistered', 'nonexistent', 'queued', 'prestaked', 'requested', 'exiting', 'finalised'] as const) {
    it(`rejects a ${state} validator without changing state`, async () => {
      const current = await load().ensure('current');
      const options: Parameters<typeof submission>[1] = {};
      if (state === 'unregistered') options.address = await current.context.actorAddress('proposer');
      if (state === 'nonexistent') options.validatorId = 99n;
      if (state === 'queued' || state === 'prestaked') {
        if (state === 'queued') await current.pdao.settings.deposits.setAssignmentsEnabled(false);
        else await current.depositPool.fund('depositor', 28n * ETH);
        await current.megapools.deposit('node');
        options.validatorId = 2n;
      }
      if (state === 'requested') await finalise(current, await challenge(current));
      if (state === 'exiting' || state === 'finalised') {
        await (await current.contracts.rocketNetworkExit.connect(await current.context.actor('node'))
          .exitMegapoolValidators(await current.megapools.address('node'), [0n], { value: 1n })).wait();
        if (state === 'finalised') {
          await current.time.advance(114n * 384n);
          await finaliseMegapoolValidatorAndAssert(current, 'node', 0n, 32n * ETH);
        }
      }
      const reason = state === 'requested' ? 'Exit has already been requested' : state === 'exiting' ? 'Already exiting'
        : state === 'finalised' ? 'Already exited' : state === 'unregistered' ? 'Invalid megapool'
          : state === 'nonexistent' ? 'Validator does not exist' : 'Validator not staked';
      await rejects(current, async () => (await participant(current, 'proposer')).challengeMegapool(...await submission(current, options)), reason);
    });
  }

  it('enforces the strict oldest start boundary and excludes current and future starts', async () => {
    const current = await load().ensure('current');
    const epoch = await currentEpoch(current);
    const contract = await participant(current, 'proposer');
    for (const start of [epoch, epoch + 1n]) {
      await rejects(current, async () => contract.challengeMegapool(...await submission(current, { start })), 'Challenge starts in future');
    }
    const oldest = epoch - 44032n - 225n;
    await rejects(current, async () => contract.challengeMegapool(...await submission(current, { start: oldest })), 'Challenge too recent');
    await challenge(current, { start: oldest + 1n });
  });

  for (const age of [3600n, 3601n]) {
    it(`${age === 3600n ? 'accepts' : 'rejects'} a slot proof aged ${age} seconds`, async () => {
      const current = await load().ensure('current');
      const timestamp = await current.time.latest();
      const proof = slotProof(await currentSlot(current));
      await setTime(timestamp + age);
      if (age === 3600n) await challenge(current, { timestamp, proof });
      else await rejects(current, async () => (await participant(current, 'proposer')).challengeMegapool(...await submission(current, {
        timestamp,
        proof,
      })), 'Slot proof too old');
    });
  }

  it('rejects 2641 missed epochs and accepts 2642 at the default threshold', async () => {
    const current = await load().ensure('current');
    await rejects(current, async () => (await participant(current, 'proposer')).challengeMegapool(...await submission(current, { words: bitmap(PERIOD, range(2641)) })), 'Participation is above requirement');
    await challenge(current);
  });

  for (const invalid of ['short', 'long', 'padding', 'incomplete', 'outside-period'] as const) {
    it(`rejects ${invalid} bitmap data`, async () => {
      const current = await load().ensure('current');
      await setSetting(current, 'period', 513n);
      let words = bitmap(513, range(31));
      let start = await currentEpoch(current) - 513n;
      if (invalid === 'short') words = words.slice(0, -1);
      if (invalid === 'long') words.push(0n);
      if (invalid === 'padding') words[2] |= 1n << 255n;
      if (invalid === 'outside-period') words[2] |= 2n;
      if (invalid === 'incomplete') {
        start = await currentEpoch(current) - 32n;
        words[0] |= 1n << 32n;
      }
      await rejects(current, async () => (await participant(current, 'proposer')).challengeMegapool(...await submission(current, {
        start,
        words,
      })), 'Invalid participation bitmap');
    });
  }

  for (const offset of [0, 255, 256]) {
    it(`defeats a challenge permissionlessly with a target vote at offset ${offset}`, async () => {
      const current = await load().ensure('current');
      const c = await challenge(current);
      const args = await participationArgs(current, c, offset);
      const responder = current.contracts.rocketNetworkParticipation.connect(await current.context.actor('responder'));
      await assertDefeated(current, c.id, () => responder.respondWithMegapoolParticipation(...args));
    });
  }

  for (const invalid of ['unchallenged', 'leaf', 'witness', 'short-witness', 'long-witness', 'oversized-witness', 'pubkey', 'index', 'epoch', 'offset', 'source', 'head'] as const) {
    it(`rejects a participation response with invalid ${invalid}`, async () => {
      const current = await load().ensure('current');
      const c = await challenge(current);
      const args = [...await participationArgs(current, c, invalid === 'unchallenged' ? 3000 : 0,
        invalid === 'source' ? 1 : invalid === 'head' ? 4 : 2)] as [...Awaited<ReturnType<typeof participationArgs>>];
      if (invalid === 'leaf') args[3] ^= 2n;
      if (invalid === 'witness') args[4][0] = ZeroHash;
      if (invalid === 'short-witness') args[4].pop();
      if (invalid === 'long-witness') args[4].push(ZeroHash);
      if (invalid === 'oversized-witness') args[4] = Array(256).fill(ZeroHash);
      if (invalid === 'pubkey') args[6].validator.pubkey = (await validatorProof(current, 'node', 1n)).validator.pubkey;
      if (invalid === 'index') args[6].validatorIndex += 1n;
      if (invalid === 'epoch') args[7] = { ...args[7], participationSlot: args[7].participationSlot + 32n };
      if (invalid === 'offset') args[2] = 44032n;
      const reasons = {
        unchallenged: 'Epoch not challenged',
        leaf: 'Invalid challenge proof',
        witness: 'Invalid challenge proof',
        'short-witness': 'Invalid witness length',
        'long-witness': 'Invalid witness length',
        'oversized-witness': 'Invalid witness length',
        pubkey: 'Incorrect validator',
        index: 'Incorrect validator index',
        epoch: 'Invalid slot',
        offset: 'Epoch too high',
        source: 'Invalid participation',
        head: 'Invalid participation',
      };
      await rejects(current, async () => (await participant(current)).respondWithMegapoolParticipation(...args), reasons[invalid]);
    });
  }

  it('requires an empty challenge witness for a single-leaf bitmap', async () => {
    const current = await load().ensure('current');
    await setSetting(current, 'period', 256n);
    const c = await challenge(current, { words: bitmap(256, range(16)) });
    const args = [...await participationArgs(current, c)] as [...Awaited<ReturnType<typeof participationArgs>>];
    assert.equal(args[4].length, 0);
    args[4].push(ZeroHash);
    await rejects(current, async () => (await participant(current)).respondWithMegapoolParticipation(...args), 'Invalid witness length');
    args[4].pop();
    await assertDefeated(current, c.id, async () => (await participant(current)).respondWithMegapoolParticipation(...args));
  });

  it('defeats a challenge permissionlessly with late activation', async () => {
    const current = await load().ensure('current');
    const c = await challenge(current);
    const args = await activationArgs(current, c);
    const responder = current.contracts.rocketNetworkParticipation.connect(await current.context.actor('responder'));
    await assertDefeated(current, c.id, () => responder.respondWithMegapoolValidator(...args));
  });

  for (const invalid of ['equal', 'earlier', 'pubkey', 'stale'] as const) {
    it(`rejects an activation response with ${invalid} proof data`, async () => {
      const current = await load().ensure('current');
      const c = await challenge(current);
      const args = [...await activationArgs(current, c, invalid === 'equal' ? c.start : invalid === 'earlier' ? c.start - 1n : c.start + 1n)] as [...Awaited<ReturnType<typeof activationArgs>>];
      if (invalid === 'pubkey') args[3].validator.pubkey = (await validatorProof(current, 'node', 1n)).validator.pubkey;
      if (invalid === 'stale') await setTime(args[2] + 3601n);
      await rejects(current, async () => (await participant(current)).respondWithMegapoolValidator(...args),
        invalid === 'pubkey' ? 'Incorrect validator' : invalid === 'stale' ? 'Slot proof too old' : 'Validator was staking during challenge period');
    });
  }

  for (const activation of ['equal', 'earlier'] as const) {
    for (const withdrawal of ['before', 'at'] as const) {
      it(`rejects activation ${activation} to the start even when withdrawable ${withdrawal} the window end`, async () => {
        const current = await load().ensure('current');
        const c = await challenge(current, { validatorIds: [0n, 1n] });
        const period = await current.contracts.rocketDAOProtocolSettingsNetwork.getPerformancePeriod();
        // A non-first member's withdrawal eligibility must not defeat the entire list.
        const args = await activationArgs(current, {
          ...c,
          validatorId: 1n,
        }, activation === 'equal' ? c.start : c.start - 1n);
        args[3].validator.withdrawableEpoch = c.start + period - (withdrawal === 'before' ? 1n : 0n);
        args[3].validator.exitEpoch = args[3].validator.withdrawableEpoch - 256n;
        await rejects(current, async () => (await participant(current)).respondWithMegapoolValidator(...args),
          'Validator was staking during challenge period');
        await finalise(current, c);
        const state = await getExitState(current);
        assert.equal(state.requested, 56n * ETH);
        assert.equal(state.outstanding, 2n);
        assert.deepEqual(state.validators.map(validator => validator.type), [1n, 1n]);
      });
    }
  }

  for (const response of ['participation', 'activation'] as const) {
    for (const late of [false, true]) {
      it(`${late ? 'rejects' : 'accepts'} ${response} response ${late ? 'after' : 'at'} the deadline`, async () => {
        const current = await load().ensure('current');
        const c = await challenge(current);
        const deadline = c.time + 86400n;
        await current.time.advance(deadline - await current.time.latest() - 10n);
        const contract = current.contracts.rocketNetworkParticipation.connect(await current.context.actor('responder'));
        const activation = await activationArgs(current, c);
        const participation = await participationArgs(current, c);
        await setTime(deadline + (late ? 1n : 0n));
        const action = () => response === 'activation' ? contract.respondWithMegapoolValidator(...activation) : contract.respondWithMegapoolParticipation(...participation);
        if (late) await rejects(current, action, 'Challenge period has passed');
        else await assertDefeated(current, c.id, action);
      });
    }
  }

  it('rejects nonexistent challenges on both response paths and finalization', async () => {
    const current = await load().ensure('current');
    const c = { ...await challenge(current), id: 999n };
    const a = await activationArgs(current, c);
    const p = await participationArgs(current, c);
    const contract = await participant(current);
    await rejects(current, () => contract.respondWithMegapoolValidator(...a), 'Invalid challenge');
    await rejects(current, () => contract.respondWithMegapoolParticipation(...p), 'Invalid challenge');
    await rejects(current, () => contract.finaliseChallenge(c.id), 'Invalid challenge');
  });

  it('finalises after the deadline into one RPIP-80 request and rejects replay', async () => {
    const current = await load().ensure('current');
    const c = await challenge(current);
    const contract = await participant(current);
    await setTime(c.time + 86400n);
    await rejects(current, () => contract.finaliseChallenge(c.id), 'Not enough time has passed');
    await finalise(current, c);
    const state = await getExitState(current);
    assert.equal(state.requested, 28n * ETH);
    assert.equal(state.voluntary, 0n);
    assert.equal(state.outstanding, 1n);
    assert.equal(state.validators[0].type, 1n);
    assert.equal(state.validators[0].timer, c.time + 86401n);
    assert.equal(state.validators[0].expected, 28n * ETH);
    assert.equal(state.exiting, 0n);
    assert.equal(state.requests, 0n);
    assert.equal((await (await current.megapools.delegate('node')).getValidatorInfo(0n)).exiting, false);
    await rejects(current, () => contract.finaliseChallenge(c.id), 'Challenge already finalised');
  });

  it('keeps challenges for different validators independent', async () => {
    const current = await load().ensure('current');
    const first = await challenge(current);
    const second = await challenge(current, { validatorId: 1n });
    const args = await activationArgs(current, first);
    await assertDefeated(current, first.id, async () => (await participant(current)).respondWithMegapoolValidator(...args));
    assert.equal(await current.contracts.rocketStorage.getBool(key('responded', second.id)), false);
    await finalise(current, second);
    assert.equal((await getExitState(current)).requested, 28n * ETH);
  });

  it('finalises without another request if the owner has already exited the validator', async () => {
    const current = await load().ensure('current');
    const c = await challenge(current);
    await (await current.contracts.rocketNetworkExit.connect(await current.context.actor('node'))
      .exitMegapoolValidators(await current.megapools.address('node'), [0n], { value: 1n })).wait();
    await setTime(c.time + 86401n);
    await (await (await participant(current)).finaliseChallenge(c.id)).wait();
    assert.equal((await getExitState(current)).requested, 0n);
    assert.equal((await getExitState(current)).requests, 1n);
    assert.equal(await current.contracts.rocketStorage.getBool(key('finalised', c.id)), true);
  });

  it('completes challenge, cooperative wait, forced exit and final-balance reconciliation', async () => {
    const current = await load().ensure('current');
    const c = await challenge(current);
    await finalise(current, c);
    const exit = current.contracts.rocketNetworkExit.connect(await current.context.actor('finaliser'));
    const address = await current.megapools.address('node');
    const pool = await current.megapools.delegate('node');
    const timer = await exit.getMegapoolCooperativeExitStart(address, 0n);
    const wait = await current.contracts.rocketDAOProtocolSettingsNetwork.getCooperativeExitPhase();
    await rejects(current, () => exit.forceMegapoolExit(address, 0n, { value: 1n }), 'Not enough time has passed');
    await setTime(timer + wait + 1n);
    await (await exit.forceMegapoolExit(address, 0n, { value: 1n })).wait();
    const mock = await predeploy(current);
    assert.equal(await mock.requestCount(), 1n);
    const events = await mock.queryFilter(mock.filters.WithdrawalRequestQueued(), 'latest', 'latest');
    assert.equal(events.length, 1);
    assert.equal(events[0].args.caller, address);
    assert.equal(events[0].args.pubkey, await pool.getValidatorPubkey(0n));
    assert.equal(events[0].args.amount, 0n);
    assert.equal(events[0].args.value, 1n);
    assert.equal(await mock.lastRequest(), `${await pool.getValidatorPubkey(0n)}0000000000000000`);
    assert.equal(await pool.getExitingValidatorCount(), 1n);
    assert.equal(await exit.getRequestedEth(), 28n * ETH);
    await current.time.advance(114n * 384n);
    await finaliseMegapoolValidatorAndAssert(current, 'node', 0n, 32n * ETH);
    assert.equal(await exit.getRequestedEth(), 0n);
    assert.equal(await exit.getMegapoolOutstandingExitCount(address), 0n);
    assert.equal(await pool.getExitingValidatorCount(), 0n);
    assert.equal(await pool.getActiveValidatorCount(), 1n);
    assert.equal(await exit.getMegapoolExpectedUserCapital(address, 0n), 0n);
    assert.equal(await exit.getMegapoolCooperativeExitStart(address, 0n), 0n);
    assert.equal(await pool.getNodeBond(), 4n * ETH);
    assert.equal(await pool.getDebt(), 0n);
    assert.equal(await mock.requestCount(), 1n);
    const epoch = await currentEpoch(current);
    const timestamp = await current.time.latest();
    const withdrawn = await withdrawalProof(current, 'node', 32n * ETH, epoch * 32n);
    const validator = await validatorProof(current, 'node', 0n, { withdrawableEpoch: epoch });
    const slot = slotProof(await currentSlot(current));
    const manager = current.contracts.rocketMegapoolManager.connect(await current.context.actor('node'));
    // Resubmit the final-balance proof without funding another withdrawal.
    await rejects(current, () => manager.notifyFinalBalance(address, 0n, timestamp, withdrawn, validator, slot), 'Already exited');
    await rejects(current, async () => (await participant(current)).finaliseChallenge(c.id), 'Challenge already finalised');
  });

  describe('validator lists', () => {
    before(async () => {
      const current = await load().ensure('current');
      await current.depositPool.fund('depositor', 28n * ETH);
      await current.megapools.deposit('node');
      await stakeMegapoolValidatorAndAssert(current, 'node', 2n);
    });

    async function finaliseList(current: ProtocolCurrent, c: Challenge, requestedIds: bigint[], gasLimit?: bigint) {
      const before = await getExitState(current);
      const receipt = await finalise(current, c, gasLimit === undefined ? {} : { gasLimit });
      const logs = receipt.logs.map(log => {
        for (const contract of [current.contracts.rocketNetworkParticipation, current.contracts.rocketNetworkExit]) {
          try {
            const parsed = contract.interface.parseLog(log);
            if (parsed) return parsed;
          } catch { /* Other event. */
          }
        }
        return null;
      });
      const summaries = logs.filter(log => log?.name === 'MegapoolChallengeFinalised');
      assert.equal(summaries.length, 1);
      assert.deepEqual(Array.from(summaries[0]!.args), [c.id, BigInt(requestedIds.length), BigInt(c.validatorIds.length - requestedIds.length)]);
      const requests = logs.filter(log => log?.name === 'MegapoolExitRequested');
      assert.deepEqual(requests.map(log => log!.args[1]), requestedIds);
      const after = await getExitState(current);
      const requestTime = BigInt((await ethers.provider.getBlock(receipt.blockNumber))!.timestamp);
      for (const id of requestedIds) {
        const validator = after.validators[Number(id)];
        assert.equal(validator.type, 1n);
        assert.equal(validator.timer, requestTime);
        assert.equal(validator.expected, 28n * ETH);
        assert.equal((await (await current.megapools.delegate('node')).getValidatorInfo(id)).exiting, false);
      }
      for (const id of c.validatorIds.filter(id => !requestedIds.includes(id))) {
        assert.deepEqual(after.validators[Number(id)], before.validators[Number(id)], 'Skipped validator changed');
      }
      assert.equal(after.requested - before.requested, BigInt(requestedIds.length) * 28n * ETH);
      assert.equal(after.outstanding - before.outstanding, BigInt(requestedIds.length));
      assert.equal(after.voluntary, before.voluntary);
      assert.equal(after.exiting, before.exiting);
      assert.equal(after.requests, before.requests);
      assert.equal(after.debt, before.debt);
      assert.deepEqual(after.balances, before.balances);
      assert.equal(await current.contracts.rocketStorage.getBool(key('finalised', c.id)), true);
      return receipt;
    }

    it('stores an ordered list and one shared bitmap', async () => {
      const current = await load().ensure('current');
      const c = await challenge(current, { validatorIds: [2n, 0n, 1n] });
      assert.deepEqual(Array.from(await current.contracts.rocketNetworkParticipation.getChallengeValidatorIds(c.id)), c.validatorIds);
      assert.equal(await current.contracts.rocketStorage.getBytes(key('validatorIds', c.id)),
        AbiCoder.defaultAbiCoder().encode(['uint32[]'], [c.validatorIds]));
      await expectRevert(() => current.contracts.rocketNetworkParticipation.getChallengeValidatorIds(999n), 'Invalid challenge');
    });

    for (const [label, ids, reason] of [
      ['empty', [], 'No validators supplied'],
      ['over the cap', range(33).map(BigInt), 'Too many validators'],
      ['adjacent duplicates', [0n, 0n], 'Duplicate validator'],
      ['nonadjacent duplicates', [0n, 1n, 0n], 'Duplicate validator'],
      ['nonexistent first member', [99n, 0n, 1n], 'Validator does not exist'],
      ['nonexistent middle member', [0n, 99n, 1n], 'Validator does not exist'],
      ['nonexistent last member', [0n, 1n, 99n], 'Validator does not exist'],
    ] as const) {
      it(`rejects a list with ${label} atomically`, async () => {
        const current = await load().ensure('current');
        await rejects(current, async () => (await participant(current, 'proposer')).challengeMegapool(
          ...await submission(current, { validatorIds: [...ids] })), reason);
      });
    }

    for (const position of [0, 1, 2]) {
      it(`rejects an already requested member at position ${position} atomically`, async () => {
        const current = await load().ensure('current');
        await finalise(current, await challenge(current, { validatorId: 1n }));
        const ids = [0n, 2n];
        ids.splice(position, 0, 1n);
        await rejects(current, async () => (await participant(current, 'proposer')).challengeMegapool(
          ...await submission(current, { validatorIds: ids })), 'Exit has already been requested');
      });
    }

    for (const response of ['participation', 'activation'] as const) {
      for (const id of [0n, 1n, 2n]) {
        it(`defeats the entire list with a ${response} response for member ${id}`, async () => {
          const current = await load().ensure('current');
          const c = await challenge(current, { validatorIds: [0n, 1n, 2n] });
          const selected = { ...c, validatorId: id };
          const p = await participationArgs(current, selected);
          const a = await activationArgs(current, selected);
          const responder = current.contracts.rocketNetworkParticipation.connect(await current.context.actor('responder'));
          await assertDefeated(current, c.id, () => response === 'participation'
            ? responder.respondWithMegapoolParticipation(...p) : responder.respondWithMegapoolValidator(...a));
          // Both response paths are closed, not just the path which defeated the list.
          await rejects(current, () => responder.respondWithMegapoolParticipation(...p), 'Challenge was defeated');
          await rejects(current, () => responder.respondWithMegapoolValidator(...a), 'Challenge was defeated');
        });
      }
      for (const mismatch of ['unlisted', 'another member'] as const) {
        it(`rejects a ${response} proof for ${mismatch}`, async () => {
          const current = await load().ensure('current');
          const c = await challenge(current, { validatorIds: mismatch === 'unlisted' ? [0n, 2n] : [0n, 1n, 2n] });
          const p = [...await participationArgs(current, {
            ...c,
            validatorId: 1n,
          })] as [...Awaited<ReturnType<typeof participationArgs>>];
          const a = [...await activationArgs(current, {
            ...c,
            validatorId: 1n,
          })] as [...Awaited<ReturnType<typeof activationArgs>>];
          if (mismatch === 'another member') {
            p[1] = 0n;
            a[1] = 0n;
          }
          const responder = current.contracts.rocketNetworkParticipation.connect(await current.context.actor('responder'));
          await rejects(current, () => response === 'participation'
              ? responder.respondWithMegapoolParticipation(...p) : responder.respondWithMegapoolValidator(...a),
            mismatch === 'unlisted' ? 'Validator not in challenge' : 'Incorrect validator');
        });
      }
    }

    it('requests all list members in supplied order and closes both response paths', async () => {
      const current = await load().ensure('current');
      const c = await challenge(current, { validatorIds: [2n, 0n, 1n] });
      await finaliseList(current, c, c.validatorIds);
      const contract = await participant(current);
      const p = await participationArgs(current, c);
      const a = await activationArgs(current, c);
      await rejects(current, () => contract.respondWithMegapoolParticipation(...p), 'Challenge already finalised');
      await rejects(current, () => contract.respondWithMegapoolValidator(...a), 'Challenge already finalised');
      await rejects(current, () => contract.finaliseChallenge(c.id), 'Challenge already finalised');
    });

    for (const handled of ['owner exit', 'requested exit', 'voluntary exit', 'finalised validator'] as const) {
      it(`skips a ${handled} and requests the remaining members`, async () => {
        const current = await load().ensure('current');
        const c = await challenge(current, { validatorIds: [0n, 1n, 2n] });
        if (handled === 'requested exit') {
          await finalise(current, await challenge(current, { validatorId: 1n }));
        } else if (handled === 'voluntary exit') {
          await notifyMegapoolExitAndAssert(current, 'node', 1n, await currentEpoch(current) + 114n);
        } else {
          await (await current.contracts.rocketNetworkExit.connect(await current.context.actor('node'))
            .exitMegapoolValidators(await current.megapools.address('node'), [1n], { value: 1n })).wait();
          if (handled === 'finalised validator') {
            await current.time.advance(114n * 384n);
            await finaliseMegapoolValidatorAndAssert(current, 'node', 1n, 32n * ETH);
          }
        }
        await finaliseList(current, c, [0n, 2n]);
      });
    }

    it('completes an all-skipped list without changing exit accounting', async () => {
      const current = await load().ensure('current');
      const c = await challenge(current, { validatorIds: [0n, 1n, 2n] });
      await (await current.contracts.rocketNetworkExit.connect(await current.context.actor('node'))
        .exitMegapoolValidators(await current.megapools.address('node'), c.validatorIds, { value: 3n })).wait();
      const before = await getExitState(current);
      await finaliseList(current, c, []);
      assert.deepEqual(await getExitState(current), before);
      await rejects(current, async () => (await participant(current)).finaliseChallenge(c.id), 'Challenge already finalised');
    });

    it('finalises overlapping lists without repeating requests', async () => {
      const current = await load().ensure('current');
      const first = await challenge(current, { validatorIds: [0n, 1n] });
      const second = await challenge(current, { validatorIds: [1n, 2n] });
      await finaliseList(current, first, [0n, 1n]);
      await finaliseList(current, second, [2n]);
      assert.equal((await getExitState(current)).requested, 84n * ETH);
    });

    it('preserves overlapping list membership and defeat state across disable and re-enable', async () => {
      const current = await load().ensure('current');
      const first = await challenge(current, { validatorIds: [0n, 1n, 2n] });
      const second = await challenge(current, { validatorIds: [2n, 1n, 0n] });
      const before = await challengeState(current);
      await setSetting(current, 'exits.enabled', false);
      assert.deepEqual(await challengeState(current), before);
      const a = await activationArgs(current, { ...first, validatorId: 2n });
      await assertDefeated(current, first.id, async () => (await participant(current)).respondWithMegapoolValidator(...a));
      const defeated = await challengeState(current);
      await setSetting(current, 'exits.enabled', true);
      assert.deepEqual(await challengeState(current), defeated);
      await setSetting(current, 'exits.enabled', false);
      await finaliseList(current, second, second.validatorIds);
      await rejects(current, async () => (await participant(current)).finaliseChallenge(first.id), 'Challenge was defeated');
    });

    it('rolls back the entire list when a later request fails and can retry after recovery', async () => {
      const current = await load().ensure('current');
      const c = await challenge(current, { validatorIds: [0n, 1n, 2n] });
      const address = await current.megapools.address('node');
      const storage = await current.context.fixtures.storage.deploy('participation-list-fault');
      const countKey = solidityPackedKeccak256(['string', 'address'], ['exit.megapool.outstanding.count', address]);
      // Fault injection: one request fits, but the second will exceed the active count.
      await storage.setUint(countKey, 2n);
      await asNetworkContract(current, 'rocketNetworkParticipation', async signer => {
        await current.contracts.rocketNetworkExit.connect(signer).requestMegapoolExit.staticCall(address, 0n);
      });
      const eventsBefore = await current.contracts.rocketNetworkExit.queryFilter(current.contracts.rocketNetworkExit.filters.MegapoolExitRequested());
      const summariesBefore = await current.contracts.rocketNetworkParticipation.queryFilter(current.contracts.rocketNetworkParticipation.filters.MegapoolChallengeFinalised());
      await setTime(c.time + 86401n);
      await rejects(current, async () => (await participant(current)).finaliseChallenge(c.id, { gasLimit: 12_000_000n }), 'Too many outstanding exits');
      assert.equal((await current.contracts.rocketNetworkExit.queryFilter(current.contracts.rocketNetworkExit.filters.MegapoolExitRequested())).length, eventsBefore.length);
      assert.equal((await current.contracts.rocketNetworkParticipation.queryFilter(current.contracts.rocketNetworkParticipation.filters.MegapoolChallengeFinalised())).length, summariesBefore.length);
      assert.equal(await current.contracts.rocketStorage.getBool(key('finalised', c.id)), false);
      await storage.setUint(countKey, 0n);
      await finaliseList(current, c, c.validatorIds);
    });

    it('finalises 32 validators within twelve million gas', async () => {
      const current = await load().ensure('current');
      await current.depositPool.fund('depositor', 29n * 28n * ETH);
      for (let id = 3n; id < 32n; id++) {
        await current.megapools.deposit('node');
        await stakeMegapoolValidatorAndAssert(current, 'node', id);
      }
      const c = await challenge(current, { validatorIds: range(32).map(BigInt) });
      const receipt = await finaliseList(current, c, c.validatorIds, 12_000_000n);
      assert(receipt.gasUsed < 12_000_000n);
      assert.equal((await getExitState(current)).requested, 896n * ETH);
      console.log(`      32-validator list finalization gas: ${receipt.gasUsed}`);
    });

    it('forces and reconciles every exit in a finalised list once', async () => {
      const current = await load().ensure('current');
      const c = await challenge(current, { validatorIds: [2n, 0n, 1n] });
      await finaliseList(current, c, c.validatorIds);
      const exit = current.contracts.rocketNetworkExit.connect(await current.context.actor('finaliser'));
      const address = await current.megapools.address('node');
      const timer = await exit.getMegapoolCooperativeExitStart(address, 0n);
      await setTime(timer + await current.contracts.rocketDAOProtocolSettingsNetwork.getCooperativeExitPhase() + 1n);
      for (const id of c.validatorIds) await (await exit.forceMegapoolExit(address, id, { value: 1n })).wait();
      const pool = await current.megapools.delegate('node');
      const requests = await (await predeploy(current)).queryFilter((await predeploy(current)).filters.WithdrawalRequestQueued());
      assert.equal(requests.length, 3);
      assert.deepEqual(requests.map(event => event.args.pubkey), await Promise.all(c.validatorIds.map(id => pool.getValidatorPubkey(id))));
      for (const request of requests) {
        assert.equal(request.args.caller, address);
        assert.equal(request.args.amount, 0n);
        assert.equal(request.args.value, 1n);
      }
      await current.time.advance(114n * 384n);
      for (const [index, id] of c.validatorIds.entries()) {
        await finaliseMegapoolValidatorAndAssert(current, 'node', id, 32n * ETH);
        assert.equal(await exit.getRequestedEth(), BigInt(2 - index) * 28n * ETH);
        assert.equal(await exit.getMegapoolExpectedUserCapital(address, id), 0n);
        assert.equal(await exit.getMegapoolCooperativeExitStart(address, id), 0n);
      }
      assert.equal(await exit.getMegapoolOutstandingExitCount(address), 0n);
      assert.equal(await pool.getExitingValidatorCount(), 0n);
      assert.equal(await pool.getActiveValidatorCount(), 0n);
      assert.equal(await pool.getNodeBond(), 0n);
      await rejects(current, async () => (await participant(current)).finaliseChallenge(c.id), 'Challenge already finalised');
    });
  });

  describe('with Beacon State verification enabled', () => {
    before(async () => {
      const current = await load().ensure('current');
      await (await current.contracts.beaconStateVerifier.connect(await current.context.actor('finaliser')).setDisabled(false)).wait();
    });

    async function verifiedChallenge(current: ProtocolCurrent, validatorIds = [0n]) {
      const proofs = await beaconProofs(current, { participationEpoch: await currentEpoch(current) - 4n });
      return challenge(current, { validatorIds, timestamp: proofs.timestamp, proof: proofs.slotProof });
    }

    it('accepts a challenge with a verified slot proof', async () => {
      await verifiedChallenge(await load().ensure('current'));
    });

    for (const historical of [false, true]) {
      for (const index of [31n, 32n]) {
        it(`verifies a ${historical ? 'historical' : 'recent'} target proof at validator index ${index}`, async () => {
          const current = await load().ensure('current');
          const c = await verifiedChallenge(current);
          // Recent proofs need a challenged bit near the end of the measurement window.
          const epoch = historical ? c.start : await currentEpoch(current) - 4n;
          const offset = Number(epoch - c.start);
          const words = bitmap(PERIOD, [...range(2642), offset]);
          const slot = await beaconProofs(current, { participationEpoch: epoch });
          const target = await challenge(current, {
            words,
            start: c.start,
            validatorIds: [0n, 1n],
            timestamp: slot.timestamp,
            proof: slot.slotProof,
          });
          const proofs = await beaconProofs(current, {
            validatorId: 1n,
            validatorIndex: index,
            participationEpoch: epoch,
          });
          const responder = current.contracts.rocketNetworkParticipation.connect(await current.context.actor('responder'));
          await assertDefeated(current, target.id, () => responder.respondWithMegapoolParticipation(target.id, 1n, BigInt(offset), words[Math.floor(offset / 256)],
            challengeTree(words).witness(BigInt(Math.floor(offset / 256))), proofs.timestamp, proofs.validatorProof, proofs.participationProof, proofs.slotProof));
        });
      }
    }

    it('verifies a late-activation response', async () => {
      const current = await load().ensure('current');
      const c = await verifiedChallenge(current, [0n, 1n]);
      const proofs = await beaconProofs(current, {
        validatorId: 1n,
        participationEpoch: c.start,
        activationEpoch: c.start + 1n,
      });
      const responder = current.contracts.rocketNetworkParticipation.connect(await current.context.actor('responder'));
      await assertDefeated(current, c.id, () => responder.respondWithMegapoolValidator(c.id, 1n, proofs.timestamp, proofs.validatorProof, proofs.slotProof));
    });

    for (const corrupt of ['slot', 'validator', 'chunk', 'participation-witness'] as const) {
      it(`rejects a tampered ${corrupt} proof without defeating the challenge`, async () => {
        const current = await load().ensure('current');
        const c = await verifiedChallenge(current);
        const proofs = await beaconProofs(current, { participationEpoch: c.start });
        if (corrupt === 'slot') proofs.slotProof.witnesses[0] = toBeHex(123n, 32);
        if (corrupt === 'validator') proofs.validatorProof.witnesses[0] = toBeHex(123n, 32);
        if (corrupt === 'participation-witness') proofs.participationProof.witnesses[0] = toBeHex(123n, 32);
        if (corrupt === 'chunk') {
          const bytes = getBytes(proofs.participationProof.participationFlagsChunk);
          bytes[0] ^= 1; // Keep the target bit intact so rejection comes from verification.
          proofs.participationProof.participationFlagsChunk = hexlify(bytes);
        }
        const reasons = {
          slot: 'Invalid slot proof',
          validator: 'Invalid validator proof',
          chunk: 'Invalid participation proof',
          'participation-witness': 'Invalid participation proof',
        };
        await rejects(current, async () => (await participant(current)).respondWithMegapoolParticipation(c.id, c.validatorId, 0n, c.words[0], challengeTree(c.words).witness(0n),
          proofs.timestamp, proofs.validatorProof, proofs.participationProof, proofs.slotProof), reasons[corrupt]);
      });
    }

    for (const index of [31n, 32n]) {
      it(`does not use a neighbouring validator's target flag at index ${index}`, async () => {
        const current = await load().ensure('current');
        const c = await verifiedChallenge(current);
        const proofs = await beaconProofs(current, {
          participationEpoch: c.start,
          validatorIndex: index,
          flags: 0,
          neighbourFlags: 2,
        });
        assert.equal(await current.contracts.beaconStateVerifier.verifyParticipation(
          proofs.timestamp, proofs.slotProof.slot, proofs.participationProof), true);
        await rejects(current, async () => (await participant(current)).respondWithMegapoolParticipation(c.id, c.validatorId, 0n, c.words[0], challengeTree(c.words).witness(0n),
          proofs.timestamp, proofs.validatorProof, proofs.participationProof, proofs.slotProof), 'Invalid participation');
      });
    }
  });
});
