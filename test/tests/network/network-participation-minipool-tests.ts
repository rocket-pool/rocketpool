import { prepareParticipationBonds, participationBondAccounting, assertParticipationBondLocked } from "../../scenarios/network/participation-bonds";
import assert from "node:assert/strict";
import { AbiCoder, hexlify, solidityPackedKeccak256, ZeroHash, type ContractTransactionReceipt, type ContractTransactionResponse } from "ethers";
import { asNetworkContract, before, describe, expectRevert, it, load, type ProtocolCurrent } from "../../harness";
import { RocketMinipoolDelegate__factory } from "../../harness/bindings/current";
import { WithdrawalRequestPredeployMock__factory } from "../../harness/bindings/fixtures";
import { currentEpoch, currentSlot, FAR_FUTURE_EPOCH, slotProof } from "../../scenarios/megapool/proofs";
import { stakeMegapoolValidatorAndAssert } from "../../scenarios/megapool/stake-validator";
import { distributeMinipoolBalanceAndAssert } from "../../scenarios/minipool/distribute-balance";
import { beaconProofs, bitmap, challengeTree } from "../../scenarios/network/participation-proofs";
import { ethers, network } from "../../../test-old/_utils/hardhat-runtime";

const ETH = 10n ** 18n;
const PERIOD = 44032;
const PREDEPLOY = "0x00000961Ef480Eb55e80D19ad83579A64c007002";
const range = (n: number, start = 0) => Array.from({ length: n }, (_, i) => i + start);
const key = (field: string, id?: bigint) => id === undefined
    ? solidityPackedKeccak256(["string"], [`participation.challenge.${field}`])
    : solidityPackedKeccak256(["string", "uint256"], [`participation.challenge.${field}`, id]);
const setTime = (t: bigint) => network.provider.send("evm_setNextBlockTimestamp", [Number(t)]);
const address = (c: ProtocolCurrent, name: string) => c.minipools.get(name).address;
const participant = async (c: ProtocolCurrent, actor = "responder") => c.contracts.rocketNetworkParticipation.connect(await c.context.actor(actor));
const mock = async (c: ProtocolCurrent) => WithdrawalRequestPredeployMock__factory.connect(PREDEPLOY, await c.context.actor("finaliser"));
const pool = async (c: ProtocolCurrent, name: string) => RocketMinipoolDelegate__factory.connect(address(c, name), await c.context.actor("responder"));

async function prepare(count = 3, extra = true) {
    const old = await load().ensure("1.3.1");
    if (count === 32) await old.pdao.settings.minipools.setMaximumCount(await old.minipools.count() + 32n);
    await old.nodes.register("node");
    await old.nodes.stakeMinimumRpl("node", { minipools: count + 1, bond: 8n * ETH });
    for (const i of range(count)) {
        const bond = i === 1 ? 8n * ETH : 16n * ETH;
        await old.depositPool.fund("depositor", 32n * ETH - bond);
        await old.minipools.create(`pool${i}`, { node: "node", bond });
    }
    if (extra) {
        await old.nodes.register("otherNode");
        await old.nodes.stakeMinimumRpl("otherNode", { minipools: 1, bond: 16n * ETH });
        await old.depositPool.fund("depositor", 16n * ETH);
        await old.minipools.create("other", { node: "otherNode", bond: 16n * ETH });
        await old.depositPool.fund("depositor", 16n * ETH);
        await old.minipools.create("prelaunch", { node: "node", bond: 16n * ETH });
    }
    await old.time.advanceMinipoolScrubPeriod();
    for (const i of range(count)) await old.minipools.stake(`pool${i}`);
    if (extra) await old.minipools.stake("other");
    const c = await old.upgradeTo("current");
    await prepareParticipationBonds(c);
    await c.minipools.delegateUpgrade("pool0");
    await c.megapools.disableProofVerification();
    await c.minipools.setMaximumPenaltyRate(ETH);
    for (const name of ["proposer", "responder", "finaliser"]) await c.context.actor(name);
    const deployed = await new WithdrawalRequestPredeployMock__factory(await c.context.actor("finaliser")).deploy();
    await deployed.waitForDeployment();
    await network.provider.send("hardhat_setCode", [PREDEPLOY, await ethers.provider.getCode(await deployed.getAddress())]);
    await (await (await mock(c)).reset()).wait();
    await (await (await mock(c)).setFee(7n)).wait();
    return c;
}

function validator(c: ProtocolCurrent, name: string, activationEpoch = 0n, index = 31n) {
    return { validatorIndex: index, validator: {
        pubkey: c.minipools.get(name).pubkey,
        withdrawalCredentials: `0x010000000000000000000000${address(c, name).slice(2)}`,
        effectiveBalance: 32_000_000_000n, slashed: false, activationEligibilityEpoch: 0n,
        activationEpoch, exitEpoch: FAR_FUTURE_EPOCH, withdrawableEpoch: FAR_FUTURE_EPOCH,
    }, witnesses: [] as string[] };
}

async function settings(c: ProtocolCurrent, field: string, value: bigint | boolean) {
    await c.pdao.bootstrap.setSetting({ contract: "rocketDAOProtocolSettingsNetwork", path: `network.performance.${field}`,
        value: typeof value === "boolean" ? { type: "bool", value } : { type: "uint", value } });
}

async function exitState(c: ProtocolCurrent, names = ["pool0", "pool1", "pool2", "other", "prelaunch"]) {
    const e = c.contracts.rocketNetworkExit;
    const members = await Promise.all(names.map(async name => {
        const p = await pool(c, name);
        return { address: address(c, name), status: await p.getStatus(), finalised: await p.getFinalised(),
            distributed: await p.getUserDistributed(), node: await p.getNodeAddress(), user: await p.getUserDepositBalance(),
            bond: await p.getNodeDepositBalance(), refund: await p.getNodeRefundBalance(),
            expected: await e.getMinipoolExpectedUserCapital(address(c, name)), timer: await e.getMinipoolCooperativeExitStart(address(c, name)),
            count: await e.getMinipoolExitRequestCount(address(c, name)), last: await e.getMinipoolLastExit(address(c, name)),
            penalty: await c.minipools.penaltyRate(name), balance: await ethers.provider.getBalance(address(c, name)) };
    }));
    const addresses = [await e.getAddress(), await c.contracts.rocketNetworkParticipation.getAddress(),
        await c.contracts.rocketTokenRETH.getAddress(), await c.contracts.rocketDepositPool.getAddress(), PREDEPLOY];
    return { members, requested: await e.getRequestedEth(), voluntary: await e.getVoluntaryEth(),
        balances: await Promise.all(addresses.map(a => ethers.provider.getBalance(a))), requests: await (await mock(c)).requestCount() };
}

async function challengeState(c: ProtocolCurrent) {
    const s = c.contracts.rocketStorage;
    const count = await s.getUint(key("count"));
    const challenges = await Promise.all(range(Number(count)).map(async i => {
        const id = BigInt(i + 1);
        const type = await c.contracts.rocketNetworkParticipation.getChallengeType(id);
        return { type, time: await s.getUint(key("time", id)), start: await s.getUint(key("start", id)),
            period: await s.getUint(key("period", id)), root: await s.getBytes32(key("root", id)),
            node: await s.getFunction("getAddress")(key("node", id)), address: await s.getFunction("getAddress")(key("address", id)),
            members: type === 2n ? Array.from(await c.contracts.rocketNetworkParticipation.getChallengeMinipools(id))
                : Array.from(await c.contracts.rocketNetworkParticipation.getChallengeValidatorIds(id)),
            defeated: await s.getBool(key("responded", id)), finalised: await s.getBool(key("finalised", id)), bond: Array.from(await c.contracts.rocketNetworkParticipation.getChallengeBondDetails(id)) };
    }));
    return { count, challenges };
}

async function rejects(c: ProtocolCurrent, action: () => Promise<unknown>, reason: string) {
    const before = { exit: await exitState(c), challenges: await challengeState(c), bonds: await participationBondAccounting(c) };
    await expectRevert(action, reason);
    assert.deepEqual({ exit: await exitState(c), challenges: await challengeState(c), bonds: await participationBondAccounting(c) }, before);
}

async function submission(c: ProtocolCurrent, names = ["pool0", "pool1", "pool2"]) {
    return [names.map(n => address(c, n)), await currentEpoch(c) - BigInt(PERIOD), bitmap(PERIOD, range(2642)),
        await c.time.latest(), slotProof(await currentSlot(c))] as const;
}

function events(c: ProtocolCurrent, receipt: ContractTransactionReceipt, name: string) {
    return receipt.logs.flatMap(log => {
        for (const contract of [c.contracts.rocketNetworkParticipation, c.contracts.rocketNetworkExit]) {
            try { const parsed = contract.interface.parseLog(log); if (parsed?.name === name) return [parsed]; } catch { /* Other event. */ }
        }
        return [];
    });
}

async function challenge(c: ProtocolCurrent, names = ["pool0", "pool1", "pool2"], args?: Awaited<ReturnType<typeof submission>>) {
    const input = args ?? await submission(c, names);
    const before = await exitState(c);
    const beforeBond = await participationBondAccounting(c);
    const previous = await c.contracts.rocketStorage.getUint(key("count"));
    const receipt = await (await (await participant(c, "proposer")).challengeMinipools(...input)).wait();
    assert(receipt);
    const id = previous + 1n;
    const time = BigInt((await ethers.provider.getBlock(receipt.blockNumber))!.timestamp);
    const found = events(c, receipt, "MinipoolsChallenged");
    assert.equal(found.length, 1);
    assert.deepEqual(found[0].args.toArray(true), [await c.nodes.address("node"), id, input[0], input[1], challengeTree(input[2]).root, input[2]]);
    assert.equal(await c.contracts.rocketNetworkParticipation.getChallengeType(id), 2n);
    assert.deepEqual(Array.from(await c.contracts.rocketNetworkParticipation.getChallengeMinipools(id)), input[0]);
    assert.equal(await c.contracts.rocketStorage.getBytes(key("minipools", id)), AbiCoder.defaultAbiCoder().encode(["address[]"], [input[0]]));
    assert.deepEqual((await challengeState(c)).challenges[Number(id - 1n)], { type: 2n, time, start: input[1], period: BigInt(PERIOD),
        root: challengeTree(input[2]).root, node: await c.nodes.address("node"), address: ethers.ZeroAddress, members: input[0], defeated: false, finalised: false,
        bond: [await c.nodes.address("proposer"), ethers.ZeroAddress, 100n * ETH, time + 86400n, false] });
    assert.deepEqual(await exitState(c), before);
    await assertParticipationBondLocked(c, id, beforeBond);
    return { id, time, start: input[1], words: input[2], names, addresses: input[0] };
}
type Challenge = Awaited<ReturnType<typeof challenge>>;

async function response(c: ProtocolCurrent, ch: Challenge, name = "pool1", activation = false, offset = 0) {
    const v = validator(c, name, activation ? ch.start + 1n : 0n);
    const chunk = new Uint8Array(32); chunk[31] = 2;
    const timestamp = await c.time.latest();
    const slot = slotProof(await currentSlot(c));
    const target = await participant(c, "responder");
    return { v, slot, timestamp,
        a: [ch.id, address(c, name), timestamp, v, slot] as const,
        p: [ch.id, address(c, name), BigInt(offset), ch.words[Math.floor(offset / 256)], challengeTree(ch.words).witness(BigInt(Math.floor(offset / 256))), timestamp, v,
            { participationSlot: (ch.start + BigInt(offset) + 1n) * 32n, validatorIndex: v.validatorIndex, participationFlagsChunk: hexlify(chunk), witnesses: [] as string[] }, slot] as const,
        target };
}

async function defeat(c: ProtocolCurrent, ch: Challenge, action: () => Promise<ContractTransactionResponse>) {
    const before = await exitState(c);
    const receipt = await (await action()).wait(); assert(receipt);
    assert.equal(events(c, receipt, "MinipoolChallengeDefeated").length, 1);
    assert.equal(events(c, receipt, "MinipoolChallengeDefeated")[0].args[0], ch.id);
    assert.equal(events(c, receipt, "MegapoolChallengeDefeated").length, 0);
    assert.equal(await c.contracts.rocketStorage.getBool(key("responded", ch.id)), true);
    assert.deepEqual(await exitState(c), before);
    await rejects(c, async () => (await participant(c)).finaliseChallenge(ch.id), "Challenge was defeated");
}

async function finalise(c: ProtocolCurrent, ch: Challenge, requested = ch.names) {
    const before = await exitState(c);
    if (await c.time.latest() <= ch.time + 86400n) await setTime(ch.time + 86401n);
    const receipt = await (await (await participant(c, "finaliser")).finaliseChallenge(ch.id)).wait(); assert(receipt);
    assert.deepEqual(Array.from(events(c, receipt, "MinipoolChallengeFinalised")[0].args), [ch.id, BigInt(requested.length), BigInt(ch.names.length - requested.length)]);
    assert.deepEqual(events(c, receipt, "MinipoolExitRequested").map(e => e.args[0]), requested.map(n => address(c, n)));
    const after = await exitState(c);
    const t = BigInt((await ethers.provider.getBlock(receipt.blockNumber))!.timestamp);
    let capital = 0n;
    for (const [i, member] of after.members.entries()) {
        if (requested.some(n => address(c, n) === member.address)) {
            assert.equal(member.timer, t); assert.equal(member.last, t); assert.equal(member.count, before.members[i].count + 1n);
            assert.equal(member.expected, member.user); capital += member.user;
        } else assert.deepEqual(member, before.members[i]);
    }
    assert.equal(after.requested, before.requested + capital);
    assert.equal(after.voluntary, before.voluntary);
    assert.equal(after.requests, before.requests);
    assert.deepEqual(after.balances, before.balances);
    assert.equal(await c.contracts.rocketStorage.getBool(key("finalised", ch.id)), true);
    return receipt;
}

async function request(c: ProtocolCurrent, name: string) {
    await asNetworkContract(c, "rocketNetworkRedemptions", async signer => {
        await (await c.contracts.rocketNetworkExit.connect(signer).requestMinipoolExit(address(c, name))).wait();
    });
}

async function distribute(c: ProtocolCurrent, name: string, userOnly = false) {
    const user = (await c.minipools.details(name)).userDepositBalance;
    await distributeMinipoolBalanceAndAssert(c, name, { balance: 32n * ETH, expectedUser: user, expectedNode: 32n * ETH - user,
        ...(userOnly ? { caller: "finaliser", beginUserDistribution: true, expectedFinalised: false, expectedUserDistributed: true } : { expectedFinalised: true }) });
}

async function penalise(c: ProtocolCurrent, name: string) {
    const e = c.contracts.rocketNetworkExit;
    const timer = await e.getMinipoolCooperativeExitStart(address(c, name));
    const wait = await c.contracts.rocketDAOProtocolSettingsNetwork.getCooperativeExitPhase();
    await c.time.advance(timer + wait + 1n - await c.time.latest());
    await (await e.connect(await c.context.actor("finaliser")).penaliseMinipool(address(c, name), await c.time.latest(), validator(c, name), slotProof(await currentSlot(c)))).wait();
}

describe("RocketNetworkParticipation minipools", () => {
    before(async () => { await prepare(); });

    it("stores one member and ordered mixed-delegate lists with one bitmap", async () => {
        const c = await load().ensure("current");
        await challenge(c, ["pool0"]);
        await challenge(c, ["pool2", "pool0", "pool1"]);
        assert.equal((await c.minipools.delegate("pool0")).version, 4);
        assert.equal((await c.minipools.delegate("pool1")).version, 3);
    });

    for (const invalid of ["empty", "oversized", "adjacent", "nonadjacent", "operators", "unregistered", "prelaunch", "dissolved", "finalised", "distributed", "requested"] as const) {
        it(`rejects ${invalid} lists atomically`, async () => {
            const c = await load().ensure("current");
            const args = [...await submission(c)] as [...Awaited<ReturnType<typeof submission>>];
            let reason: string;
            if (invalid === "empty") { args[0] = []; reason = "No validators supplied"; }
            else if (invalid === "oversized") { args[0] = Array(33).fill(address(c, "pool0")); reason = "Too many validators"; }
            else if (invalid === "adjacent" || invalid === "nonadjacent") { args[0][invalid === "adjacent" ? 1 : 2] = args[0][0]; reason = "Duplicate validator"; }
            else if (invalid === "operators") { args[0][1] = address(c, "other"); reason = "Different node operators"; }
            else if (invalid === "unregistered") { args[0][1] = await c.nodes.address("responder"); reason = "Invalid minipool"; }
            else if (invalid === "prelaunch" || invalid === "dissolved") {
                if (invalid === "dissolved") { await c.time.advance(20n * 86400n); await c.minipools.dissolve("prelaunch", { caller: "node" }); }
                args[0][1] = address(c, "prelaunch"); reason = "Minipool is not staking";
            } else if (invalid === "requested") { await request(c, "pool1"); reason = "Minipool already requested to exit"; }
            else { await distribute(c, "pool1", invalid === "distributed"); reason = invalid === "distributed" ? "User capital already distributed" : "Minipool is finalised"; }
            args[3] = await c.time.latest(); args[4] = slotProof(await currentSlot(c));
            await rejects(c, async () => (await participant(c, "proposer")).challengeMinipools(...args), reason);
        });
    }

    for (const position of [0, 1, 2]) it(`rejects an invalid member at position ${position} without consuming an ID`, async () => {
        const c = await load().ensure("current");
        const args = [...await submission(c)] as [...Awaited<ReturnType<typeof submission>>];
        args[0][position] = await c.nodes.address("responder");
        await rejects(c, async () => (await participant(c, "proposer")).challengeMinipools(...args), "Invalid minipool");
    });

    for (const invalid of ["threshold", "short", "long", "padding", "future", "old", "stale"] as const) it(`rejects ${invalid} challenge data`, async () => {
        const c = await load().ensure("current");
        const args = [...await submission(c)] as [...Awaited<ReturnType<typeof submission>>];
        let reason = "Invalid participation bitmap";
        if (invalid === "threshold") { args[2] = bitmap(PERIOD, range(2641)); reason = "Participation is above requirement"; }
        if (invalid === "short") args[2].pop();
        if (invalid === "long") args[2].push(0n);
        if (invalid === "padding") { await settings(c, "period", 44031n); args[2][171] |= 1n << 255n; }
        if (invalid === "future") { args[1] = await currentEpoch(c); reason = "Challenge starts in future"; }
        if (invalid === "old") { args[1] -= 225n; reason = "Challenge too recent"; }
        if (invalid === "stale") { await setTime(args[3] + 3601n); reason = "Slot proof too old"; }
        await rejects(c, async () => (await participant(c, "proposer")).challengeMinipools(...args), reason);
    });

    it("accepts the oldest permitted start and a slot proof exactly one hour old", async () => {
        const c = await load().ensure("current");
        const args = [...await submission(c)] as [...Awaited<ReturnType<typeof submission>>];
        args[1] -= 224n;
        await setTime(args[3] + 3600n);
        await challenge(c, undefined, args);
    });

    for (const activation of [false, true]) for (const name of ["pool0", "pool1", "pool2"]) it(`defeats the list with ${activation ? "activation" : "participation"} for ${name}`, async () => {
        const c = await load().ensure("current"); const ch = await challenge(c);
        const r = await response(c, ch, name, activation);
        await defeat(c, ch, () => activation ? r.target.respondWithMinipoolValidator(...r.a) : r.target.respondWithMinipoolParticipation(...r.p));
        await rejects(c, () => r.target.respondWithMinipoolValidator(...r.a), "Challenge was defeated");
        await rejects(c, () => r.target.respondWithMinipoolParticipation(...r.p), "Challenge was defeated");
    });

    for (const activation of [false, true]) it(`rejects unlisted and mismatched members on ${activation ? "activation" : "participation"} responses`, async () => {
        const c = await load().ensure("current"); const ch = await challenge(c);
        const other = await response(c, ch, "other", activation);
        await rejects(c, () => activation ? other.target.respondWithMinipoolValidator(...other.a) : other.target.respondWithMinipoolParticipation(...other.p), "Validator not in challenge");
        const r = await response(c, ch, "pool1", activation); r.v.validator.pubkey = c.minipools.get("pool2").pubkey;
        await rejects(c, () => activation ? r.target.respondWithMinipoolValidator(...r.a) : r.target.respondWithMinipoolParticipation(...r.p), "Incorrect validator");
    });

    for (const earlier of [false, true]) it(`rejects ${earlier ? "earlier" : "equal"} activation despite withdrawal eligibility`, async () => {
        const c = await load().ensure("current"); const ch = await challenge(c); const r = await response(c, ch, "pool1", true);
        r.v.validator.activationEpoch = ch.start - (earlier ? 1n : 0n); r.v.validator.withdrawableEpoch = ch.start + BigInt(PERIOD);
        await rejects(c, () => r.target.respondWithMinipoolValidator(...r.a), "Validator was staking during challenge period");
    });

    for (const invalid of ["unchallenged", "leaf", "witness", "short-witness", "long-witness", "index", "epoch", "offset", "source", "head"] as const) it(`rejects a participation response with invalid ${invalid}`, async () => {
        const c = await load().ensure("current"); const ch = await challenge(c); const r = await response(c, ch);
        const args = [...r.p] as [...typeof r.p]; let reason = "Invalid participation";
        if (invalid === "unchallenged") { args[2] = 2700n; args[3] = ch.words[10]; args[4] = challengeTree(ch.words).witness(10n); reason = "Epoch not challenged"; }
        if (invalid === "leaf") { args[3] ^= 2n; reason = "Invalid challenge proof"; }
        if (invalid === "witness") { args[4][0] = ZeroHash; reason = "Invalid challenge proof"; }
        if (invalid === "short-witness") { args[4].pop(); reason = "Invalid witness length"; }
        if (invalid === "long-witness") { args[4].push(ZeroHash); reason = "Invalid witness length"; }
        if (invalid === "index") { args[6].validatorIndex++; reason = "Incorrect validator index"; }
        if (invalid === "epoch") { args[7] = { ...args[7], participationSlot: args[7].participationSlot + 32n }; reason = "Invalid slot"; }
        if (invalid === "offset") { args[2] = BigInt(PERIOD); reason = "Epoch too high"; }
        if (invalid === "source" || invalid === "head") { const chunk = new Uint8Array(32); chunk[31] = invalid === "source" ? 1 : 4; args[7] = { ...args[7], participationFlagsChunk: hexlify(chunk) }; }
        await rejects(c, () => r.target.respondWithMinipoolParticipation(...args), reason);
    });

    for (const offset of [255, 256]) it(`accepts a target proof at bitmap offset ${offset}`, async () => {
        const c = await load().ensure("current"); const ch = await challenge(c); const r = await response(c, ch, "pool1", false, offset);
        await defeat(c, ch, () => r.target.respondWithMinipoolParticipation(...r.p));
    });

    for (const activation of [false, true]) for (const late of [false, true]) it(`${late ? "rejects" : "accepts"} ${activation ? "activation" : "participation"} ${late ? "after" : "at"} the deadline while disabled`, async () => {
        const c = await load().ensure("current"); const ch = await challenge(c);
        await settings(c, "exits.enabled", false);
        await c.time.advance(ch.time + 86400n - await c.time.latest() - 10n);
        const r = await response(c, ch, "pool1", activation); await setTime(ch.time + 86400n + (late ? 1n : 0n));
        const action = () => activation ? r.target.respondWithMinipoolValidator(...r.a) : r.target.respondWithMinipoolParticipation(...r.p);
        if (late) await rejects(c, action, "Challenge period has passed"); else await defeat(c, ch, action);
    });

    it("blocks only new submissions when disabled and preserves timing across re-enable", async () => {
        const c = await load().ensure("current"); const ch = await challenge(c);
        await settings(c, "exits.enabled", false); const args = await submission(c);
        await rejects(c, async () => (await participant(c, "proposer")).challengeMinipools(...args), "Performance exits disabled");
        await setTime(ch.time + 86400n);
        await rejects(c, async () => (await participant(c)).finaliseChallenge(ch.id), "Not enough time has passed");
        await finalise(c, ch);
        await settings(c, "exits.enabled", true);
        assert.equal(await c.contracts.rocketStorage.getUint(key("time", ch.id)), ch.time);
        await rejects(c, async () => (await participant(c)).finaliseChallenge(ch.id), "Challenge already finalised");
        const r = await response(c, ch, "pool1", true);
        await rejects(c, () => r.target.respondWithMinipoolValidator(...r.a), "Challenge already finalised");
        await rejects(c, () => r.target.respondWithMinipoolParticipation(...r.p), "Challenge already finalised");
    });

    for (const completed of ["requested", "finalised", "distributed"] as const) it(`skips ${completed} members without changing their accounting`, async () => {
        const c = await load().ensure("current"); const ch = await challenge(c);
        await request(c, "pool1");
        if (completed !== "requested") await distribute(c, "pool1", completed === "distributed");
        await finalise(c, ch, ["pool0", "pool2"]);
        assert.equal(await c.contracts.rocketNetworkExit.getMinipoolExpectedUserCapital(address(c, "pool1")), 24n * ETH);
    });

    it("finalises all-skipped lists and overlapping lists exactly once", async () => {
        const c = await load().ensure("current");
        const a = await challenge(c, ["pool0", "pool1"]); const b = await challenge(c, ["pool1", "pool2"]); const all = await challenge(c);
        await finalise(c, a); await finalise(c, b, ["pool2"]); await finalise(c, all, []);
        await rejects(c, async () => (await participant(c)).finaliseChallenge(all.id), "Challenge already finalised");
    });

    it("keeps overlapping challenges independent when one is defeated", async () => {
        const c = await load().ensure("current"); const a = await challenge(c); const b = await challenge(c);
        const r = await response(c, a, "pool1", true); await defeat(c, a, () => r.target.respondWithMinipoolValidator(...r.a));
        await finalise(c, b);
    });

    it("rolls back earlier requests during a later member's backoff and succeeds at the exact boundary", async () => {
        const c = await load().ensure("current"); const e = c.contracts.rocketNetworkExit;
        await request(c, "pool1"); const last = await e.getMinipoolLastExit(address(c, "pool1"));
        await penalise(c, "pool1");
        assert.equal(await e.getRequestedEth(), 0n);
        const ch = await challenge(c); // Submission remains possible during backoff.
        const retryAt = last + await c.contracts.rocketDAOProtocolSettingsNetwork.getDidNotExitBase();
        assert(retryAt > ch.time + 86401n);
        await setTime(ch.time + 86401n);
        await (await (await participant(c, "finaliser")).releaseChallengeBond(ch.id)).wait();
        assert.equal(await c.contracts.rocketNodeStaking.getNodeLockedRPL(await c.nodes.address("proposer")), 0n);
        await setTime(retryAt - 1n);
        const from = await ethers.provider.getBlockNumber();
        await rejects(c, async () => (await participant(c, "finaliser")).finaliseChallenge(ch.id, { gasLimit: 12_000_000n }), "Not enough time has passed");
        assert.equal((await e.queryFilter(e.filters.MinipoolExitRequested(), from + 1)).length, 0);
        assert.equal((await c.contracts.rocketNetworkParticipation.queryFilter(c.contracts.rocketNetworkParticipation.filters.MinipoolChallengeFinalised(), from + 1)).length, 0);
        await setTime(retryAt); await finalise(c, ch);
        assert.equal(await e.getMinipoolExitRequestCount(address(c, "pool1")), 2n);
    });

    it("completes an upgraded minipool exit and settles its capital once", async () => {
        const c = await load().ensure("current"); const ch = await challenge(c, ["pool0"]); await finalise(c, ch);
        const e = c.contracts.rocketNetworkExit.connect(await c.context.actor("finaliser"));
        const timer = await e.getMinipoolCooperativeExitStart(address(c, "pool0"));
        await setTime(timer + await c.contracts.rocketDAOProtocolSettingsNetwork.getCooperativeExitPhase() + 1n);
        await (await e.forceMinipoolExit(address(c, "pool0"), { value: 7n })).wait();
        const m = await mock(c); const requests = await m.queryFilter(m.filters.WithdrawalRequestQueued());
        assert.equal(requests.length, 1); assert.equal(requests[0].args.caller, address(c, "pool0"));
        assert.equal(requests[0].args.pubkey, c.minipools.get("pool0").pubkey); assert.equal(requests[0].args.amount, 0n); assert.equal(requests[0].args.value, 7n);
        await distribute(c, "pool0"); await (await e.settleMinipoolExit(address(c, "pool0"))).wait();
        assert.equal(await e.getRequestedEth(), 0n); assert.equal(await e.getMinipoolExpectedUserCapital(address(c, "pool0")), 0n);
        assert.equal(await e.getMinipoolCooperativeExitStart(address(c, "pool0")), 0n);
        await rejects(c, () => e.settleMinipoolExit(address(c, "pool0")), "Minipool exit is not requested");
    });

    it("requires a new challenge after a legacy penalty and preserves repeat-request backoff", async () => {
        const c = await load().ensure("current"); const ch = await challenge(c, ["pool1"]); await finalise(c, ch);
        const e = c.contracts.rocketNetworkExit; const last = await e.getMinipoolLastExit(address(c, "pool1"));
        await penalise(c, "pool1");
        assert.equal(await e.getRequestedEth(), 0n); assert.equal(await e.getMinipoolExpectedUserCapital(address(c, "pool1")), 0n);
        assert.equal(await e.getMinipoolCooperativeExitStart(address(c, "pool1")), 0n); assert((await c.minipools.penaltyRate("pool1")) > 0n);
        assert.equal(await (await mock(c)).requestCount(), 0n);
        await rejects(c, async () => (await participant(c)).finaliseChallenge(ch.id), "Challenge already finalised");
        const next = await challenge(c, ["pool1"]);
        const retryAt = last + await c.contracts.rocketDAOProtocolSettingsNetwork.getDidNotExitBase();
        await c.time.advance(retryAt - await c.time.latest() - 1n);
        await setTime(retryAt); await finalise(c, next);
        assert.equal(await e.getRequestedEth(), 24n * ETH); assert.equal(await e.getMinipoolExitRequestCount(address(c, "pool1")), 2n);
    });

    it("rejects nonexistent challenges and direct unauthorized exit requests", async () => {
        const c = await load().ensure("current"); const contract = await participant(c);
        const ch = { ...await challenge(c), id: 999n }; const r = await response(c, ch, "pool1", true);
        for (const action of [() => contract.getChallengeType(999n), () => contract.getChallengeMinipools(999n), () => contract.getChallengeValidatorIds(999n),
            () => contract.finaliseChallenge(999n), () => contract.respondWithMinipoolValidator(...r.a), () => contract.respondWithMinipoolParticipation(...r.p)]) {
            await rejects(c, action, "Invalid challenge");
        }
        await rejects(c, async () => c.contracts.rocketNetworkExit.connect(await c.context.actor("proposer")).requestMinipoolExit(address(c, "pool0")), "Invalid minipool exit requester");
    });

    it("interleaves megapool and minipool challenges without cross-type responses or shared terminal state", async () => {
        const c = await load().ensure("current");
        const a = await challenge(c); await c.depositPool.fund("depositor", 28n * ETH); await c.megapools.deposit("node");
        await stakeMegapoolValidatorAndAssert(c, "node", 0n);
        const contract = await participant(c); const input = await submission(c);
        await (await (await participant(c, "proposer")).challengeMegapool(await c.megapools.address("node"), [0n], input[1], input[2], input[3], input[4])).wait();
        const megaId = a.id + 1n; assert.equal(await contract.getChallengeType(megaId), 1n);
        const b = await challenge(c); assert.equal(b.id, megaId + 1n);
        const r = await response(c, a, "pool1", true);
        await rejects(c, () => contract.getChallengeValidatorIds(a.id), "Incorrect challenge type");
        await rejects(c, () => contract.getChallengeMinipools(megaId), "Incorrect challenge type");
        await rejects(c, () => contract.respondWithMegapoolValidator(a.id, 0n, r.timestamp, r.v, r.slot), "Incorrect challenge type");
        await rejects(c, () => contract.respondWithMegapoolParticipation(a.id, 0n, ...r.p.slice(2) as [bigint, bigint, string[], bigint, typeof r.v, typeof r.p[7], typeof r.slot]), "Incorrect challenge type");
        await rejects(c, () => contract.respondWithMinipoolValidator(megaId, ...r.a.slice(1) as [string, bigint, typeof r.v, typeof r.slot]), "Incorrect challenge type");
        await rejects(c, () => contract.respondWithMinipoolParticipation(megaId, ...r.p.slice(1) as [string, bigint, bigint, string[], bigint, typeof r.v, typeof r.p[7], typeof r.slot]), "Incorrect challenge type");
        await defeat(c, a, () => r.target.respondWithMinipoolValidator(...r.a));
        await finalise(c, b); await (await contract.finaliseChallenge(megaId)).wait();
        assert.equal(await c.contracts.rocketNetworkExit.getRequestedEth(), 84n * ETH);
    });

    describe("with Beacon State verification enabled", () => {
        before(async () => { const c = await load().ensure("current"); await (await c.contracts.beaconStateVerifier.connect(await c.context.actor("finaliser")).setDisabled(false)).wait(); });

        async function verified(c: ProtocolCurrent, historical = true) {
            const epoch = await currentEpoch(c) - (historical ? BigInt(PERIOD) : 4n);
            const root = await beaconProofs(c, { validator: validator(c, "pool1"), participationEpoch: epoch });
            const input = [...await submission(c)] as [...Awaited<ReturnType<typeof submission>>];
            input[2] = bitmap(PERIOD, [...range(2642), Number(epoch - input[1])]); input[3] = root.timestamp; input[4] = root.slotProof;
            return { ch: await challenge(c, undefined, input), epoch };
        }

        for (const historical of [false, true]) for (const index of [31n, 32n]) it(`verifies ${historical ? "historical" : "recent"} participation for a non-first member at index ${index}`, async () => {
            const c = await load().ensure("current"); const { ch, epoch } = await verified(c, historical);
            const proof = await beaconProofs(c, { validator: validator(c, "pool1", 0n, index), validatorIndex: index, participationEpoch: epoch });
            const offset = epoch - ch.start; const leaf = offset / 256n; const contract = await participant(c, "responder");
            await defeat(c, ch, () => contract.respondWithMinipoolParticipation(ch.id, address(c, "pool1"), offset, ch.words[Number(leaf)], challengeTree(ch.words).witness(leaf), proof.timestamp, proof.validatorProof, proof.participationProof, proof.slotProof));
        });

        it("verifies late activation for a non-first member", async () => {
            const c = await load().ensure("current"); const { ch, epoch } = await verified(c);
            const proof = await beaconProofs(c, { validator: validator(c, "pool1", ch.start + 1n), participationEpoch: epoch });
            const contract = await participant(c, "responder");
            await defeat(c, ch, () => contract.respondWithMinipoolValidator(ch.id, address(c, "pool1"), proof.timestamp, proof.validatorProof, proof.slotProof));
        });

        for (const corrupt of ["slot", "validator", "chunk", "witness"] as const) it(`rejects tampered ${corrupt} proof`, async () => {
            const c = await load().ensure("current"); const { ch, epoch } = await verified(c);
            const proof = await beaconProofs(c, { validator: validator(c, "pool1"), participationEpoch: epoch });
            if (corrupt === "slot") proof.slotProof.witnesses[0] = ethers.toBeHex(BigInt(proof.slotProof.witnesses[0]) ^ 1n, 32);
            if (corrupt === "validator") proof.validatorProof.witnesses[0] = ethers.toBeHex(BigInt(proof.validatorProof.witnesses[0]) ^ 1n, 32);
            if (corrupt === "witness") proof.participationProof.witnesses[0] = ethers.toBeHex(BigInt(proof.participationProof.witnesses[0]) ^ 1n, 32);
            if (corrupt === "chunk") { const bytes = ethers.getBytes(proof.participationProof.participationFlagsChunk); bytes[0] ^= 1; proof.participationProof.participationFlagsChunk = hexlify(bytes); }
            await rejects(c, async () => (await participant(c)).respondWithMinipoolParticipation(ch.id, address(c, "pool1"), 0n, ch.words[0], challengeTree(ch.words).witness(0n), proof.timestamp, proof.validatorProof, proof.participationProof, proof.slotProof),
                corrupt === "slot" ? "Invalid slot proof" : corrupt === "validator" ? "Invalid validator proof" : "Invalid participation proof");
        });

        for (const index of [31n, 32n]) it(`rejects a neighbouring validator's target flag at index ${index}`, async () => {
            const c = await load().ensure("current"); const { ch, epoch } = await verified(c);
            const proof = await beaconProofs(c, { validator: validator(c, "pool1"), validatorIndex: index, participationEpoch: epoch, flags: 1, neighbourFlags: 2 });
            await rejects(c, async () => (await participant(c)).respondWithMinipoolParticipation(ch.id, address(c, "pool1"), 0n, ch.words[0], challengeTree(ch.words).witness(0n), proof.timestamp, proof.validatorProof, proof.participationProof, proof.slotProof), "Invalid participation");
        });
    });
});

describe("RocketNetworkParticipation maximum minipool list", () => {
    before(async () => { await prepare(32, false); });
    it("requests all 32 exits within twelve million gas", async () => {
        const c = await load().ensure("current"); const names = range(32).map(i => `pool${i}`); const args = await submission(c, names);
        const before = await participationBondAccounting(c);
        const receipt = await (await (await participant(c, "proposer")).challengeMinipools(...args)).wait(); assert(receipt);
        const id = await c.contracts.rocketStorage.getUint(key("count"));
        await assertParticipationBondLocked(c, id, before);
        const time = BigInt((await ethers.provider.getBlock(receipt.blockNumber))!.timestamp); await setTime(time + 86401n);
        const result = await (await (await participant(c, "finaliser")).finaliseChallenge(id, { gasLimit: 12_000_000n })).wait(); assert(result);
        assert(result.gasUsed < 12_000_000n); console.log(`        32-minipool finalization gas: ${result.gasUsed}`);
        assert.deepEqual(Array.from(events(c, result, "MinipoolChallengeFinalised")[0].args), [id, 32n, 0n]);
        assert.deepEqual(events(c, result, "MinipoolExitRequested").map(e => e.args[0]), args[0]);
        const t = BigInt((await ethers.provider.getBlock(result.blockNumber))!.timestamp);
        const state = await exitState(c, names);
        assert.equal(state.requested, 520n * ETH); assert.equal(state.requests, 0n);
        for (const member of state.members) { assert.equal(member.timer, t); assert.equal(member.count, 1n); assert.equal(member.expected, member.user); }
    });
});
