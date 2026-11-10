import assert from "node:assert/strict";
import { id, Interface } from "ethers";

import { before, describe, expectRevert, it, load, type ProtocolCurrent } from "../../harness";
import { RocketMegapoolDelegate__factory } from "../../harness/bindings/current";
import { ethers, network } from "../../../test-old/_utils/hardhat-runtime";
import { stakeMegapoolValidatorAndAssert } from "../../scenarios/megapool/stake-validator";
import { dissolveMegapoolValidatorAndAssert } from "../../scenarios/megapool/dissolve-validator";
import { depositAndAssign, ETHER, prepareMegapoolProtocol } from "./fixtures";

const PERIOD = 12n * 60n * 60n;
const PERIOD_PATH = "megapool.prestake.challenge.period";
const ENABLED_PATH = "megapool.stake.without.proof.enabled";
const setTime = (timestamp: bigint) => network.provider.send("evm_setNextBlockTimestamp", [Number(timestamp)]);
const depositEvents = new Interface(["event DepositEvent(bytes pubkey, bytes withdrawal_credentials, bytes amount, bytes signature, bytes index)"]);

async function pool(current: ProtocolCurrent, caller = "random") {
    return RocketMegapoolDelegate__factory.connect(await current.megapools.address("node"), await current.context.actor(caller));
}

async function enabled(current: ProtocolCurrent, value: boolean) {
    await current.pdao.bootstrap.setSetting({
        contract: "rocketDAOProtocolSettingsMegapool", path: ENABLED_PATH, value: { type: "bool", value },
    });
}

async function cleared(current: ProtocolCurrent, validatorId = 0n) {
    const megapool = await pool(current);
    assert.equal(await megapool.getValidatorPrestakeSignature(validatorId), "0x");
    assert.equal(await megapool.getValidatorChallengeDeadline(validatorId), 0n);
    const prestake = await megapool.getValidatorPrestakeInfo(validatorId);
    assert.equal(prestake.info.inPrestake, false);
    assert.equal(prestake.signature, "0x");
    assert.equal(prestake.challengeDeadline, 0n);
    assert.equal(prestake.pubkey, await megapool.getValidatorPubkey(validatorId));
}

describe("RocketMegapool proofless staking", () => {
    before(async () => { await prepareMegapoolProtocol(); });

    it("enumerates prestake data across megapools using global rather than local validator IDs", async () => {
        const current = await load().ensure("current");
        const manager = current.contracts.rocketMegapoolManager;
        const first = await manager.getValidatorCount();
        const entries = [["node", 0n], ["node2", 0n], ["node", 1n]] as const;
        for (const [node] of entries) await current.megapools.deposit(node);
        await current.depositPool.fund("depositor", 28n * ETHER);
        await current.depositPool.assign(1n, { caller: "random" });
        for (const [offset, [node, localId]] of entries.entries()) {
            const address = await current.megapools.address(node);
            const megapool = RocketMegapoolDelegate__factory.connect(address, await current.context.actor("random"));
            const local = await megapool.getValidatorPrestakeInfo(localId);
            const global = await manager.getValidatorPrestakeInfo(first + BigInt(offset));
            assert.equal(global.megapool, address);
            assert.equal(global.validatorId, localId);
            assert.equal(global.pubkey, local.pubkey);
            assert.deepEqual(Array.from(global.validatorInfo), Array.from(local.info));
            assert.equal(global.signature, local.signature);
            assert.equal(global.challengeDeadline, local.challengeDeadline);
        }
        assert.equal((await manager.getValidatorPrestakeInfo(first)).validatorInfo.inPrestake, true);
        assert.equal((await manager.getValidatorPrestakeInfo(first + 1n)).validatorInfo.inQueue, true);
        await expectRevert(() => manager.getValidatorPrestakeInfo(first + 3n), "Validator does not exist");
    });

    it("pages over inspected entries and excludes queued, staked and dissolved validators", async () => {
        const current = await load().ensure("current");
        const manager = current.contracts.rocketMegapoolManager;
        const first = await manager.getValidatorCount();
        const empty = await manager.getPrestakedValidatorIndices(first, 2n);
        assert.deepEqual(Array.from(empty.indices), []);
        assert.equal(empty.nextIndex, first);
        assert.deepEqual(Array.from(empty.failedIndices), []);
        await expectRevert(() => manager.getPrestakedValidatorIndices(first, 0n), "Limit must be positive");
        for (const node of ["node", "node2", "node", "node2", "node2"]) await current.megapools.deposit(node);
        await current.depositPool.fund("depositor", 112n * ETHER);
        await current.depositPool.assign(4n, { caller: "random" });
        await stakeMegapoolValidatorAndAssert(current, "node", 0n);
        await dissolveMegapoolValidatorAndAssert(current, "node2", 0n, { caller: "node", proofOverrides: { slashed: true } });
        const noMatches = await manager.getPrestakedValidatorIndices(first, 2n);
        assert.deepEqual(Array.from(noMatches.indices), []);
        assert.equal(noMatches.nextIndex, first + 2n);
        assert.deepEqual(Array.from(noMatches.failedIndices), []);
        const matches = await manager.getPrestakedValidatorIndices(noMatches.nextIndex, 2n);
        assert.deepEqual(Array.from(matches.indices), [first + 2n, first + 3n]);
        assert.equal(matches.nextIndex, first + 4n);
        assert.deepEqual(Array.from(matches.failedIndices), []);
        const last = await manager.getPrestakedValidatorIndices(matches.nextIndex, 2n);
        assert.deepEqual(Array.from(last.indices), []);
        assert.equal(last.nextIndex, first + 5n);
        const large = await manager.getPrestakedValidatorIndices(first, ethers.MaxUint256);
        assert.deepEqual(Array.from(large.indices), Array.from(matches.indices));
        assert.equal(large.nextIndex, first + 5n);
        for (const offset of [last.nextIndex, ethers.MaxUint256]) {
            const end = await manager.getPrestakedValidatorIndices(offset, 2n);
            assert.deepEqual(Array.from(end.indices), []);
            assert.equal(end.nextIndex, last.nextIndex);
            assert.deepEqual(Array.from(end.failedIndices), []);
        }
    });

    it("retains the queued signature and starts the clock only at prestake", async () => {
        const current = await load().ensure("current");
        await current.megapools.deposit("node");
        const megapool = await pool(current);
        const signature = await megapool.getValidatorPrestakeSignature(0n);
        assert.equal(signature.length, 194);
        assert.equal(await megapool.getValidatorChallengeDeadline(0n), 0n);
        const queued = await megapool.getValidatorPrestakeInfo(0n);
        assert.equal(queued.info.inQueue, true);
        assert.equal(queued.info.inPrestake, false);
        assert.equal(queued.pubkey, await megapool.getValidatorPubkey(0n));
        assert.equal(queued.signature, signature);
        assert.equal(queued.challengeDeadline, 0n);
        await expectRevert(() => megapool.getValidatorPrestakeInfo(1n), "Validator does not exist");
        await current.time.advance(PERIOD * 2n);
        await expectRevert(() => megapool.stakeWithoutProof(0n), "Validator must be pre-staked");
        await expectRevert(() => megapool.stakeWithoutProof(99n), "Validator must be pre-staked");
        await current.depositPool.fund("depositor", 28n * ETHER);
        await current.depositPool.assign(1n, { caller: "random" });
        const info = await megapool.getValidatorInfo(0n);
        assert.equal(await megapool.getValidatorPrestakeSignature(0n), signature);
        assert.equal(await megapool.getValidatorChallengeDeadline(0n), info.lastAssignmentTime + PERIOD);
        const prestake = await megapool.getValidatorPrestakeInfo(0n);
        assert.deepEqual(Array.from(prestake.info), Array.from(info));
        assert.equal(prestake.info.inPrestake, true);
        assert.equal(prestake.pubkey, queued.pubkey);
        assert.equal(prestake.signature, signature);
        assert.equal(prestake.challengeDeadline, info.lastAssignmentTime + PERIOD);
        await expectRevert(() => megapool.stake(0n)); // Existing manager-only entrypoint stays restricted.
    });

    for (const offset of [0n, 1n]) {
        it(`allows an unrelated caller to stake at deadline + ${offset}, with the existing deposit and accounting`, async () => {
            const current = await load().ensure("current");
            await depositAndAssign(current);
            const megapool = await pool(current);
            const address = await megapool.getAddress();
            const deadline = await megapool.getValidatorChallengeDeadline(0n);
            const before = await megapool.getValidatorInfo(0n);
            const bond = await megapool.getNodeBond();
            const capital = await megapool.getUserCapital();
            const debt = await megapool.getDebt();
            const assigned = await megapool.getAssignedValue();
            const balance = await ethers.provider.getBalance(address);
            const casper = await current.contracts.rocketStorage.getFunction("getAddress")(id("contract.addresscasperDeposit"));
            const casperBalance = await ethers.provider.getBalance(casper);
            await setTime(deadline - 1n);
            await expectRevert(() => megapool.stakeWithoutProof(0n, { gasLimit: 3_000_000 }), "Challenge period has not elapsed");
            await setTime(deadline + offset);
            const receipt = await (await megapool.stakeWithoutProof(0n)).wait();
            assert(receipt);
            const after = await megapool.getValidatorInfo(0n);
            assert.equal(after.staked, true);
            assert.equal(after.inPrestake, false);
            assert.equal(after.lastAssignmentTime, 0n);
            assert.equal(after.lastRequestedBond, 0n);
            assert.equal(after.lastRequestedValue, 0n);
            assert.equal(after.depositValue - before.depositValue, 31_000n);
            assert.equal(assigned - await megapool.getAssignedValue(), 31n * ETHER);
            assert.equal(balance - await ethers.provider.getBalance(address), 31n * ETHER);
            assert.equal(await ethers.provider.getBalance(casper) - casperBalance, 31n * ETHER);
            assert.equal(await megapool.getNodeBond(), bond);
            assert.equal(await megapool.getUserCapital(), capital);
            assert.equal(await megapool.getDebt(), debt);
            const event = receipt.logs.filter(log => log.address.toLowerCase() === casper.toLowerCase()).map(log => depositEvents.parseLog(log))[0];
            assert(event);
            assert.equal(event.args.pubkey, await megapool.getValidatorPubkey(0n));
            assert.equal(event.args.withdrawal_credentials, await megapool.getWithdrawalCredentials());
            const amount = Buffer.alloc(8);
            amount.writeBigUInt64LE(31_000_000_000n);
            assert.equal(event.args.amount, `0x${amount.toString("hex")}`);
            assert.equal(event.args.signature, `0x${"00".repeat(96)}`);
            assert(receipt.logs.some(log => log.topics[0] === id("MegapoolValidatorStaked(uint256,uint256)")));
            await cleared(current);
            await expectRevert(() => megapool.stakeWithoutProof(0n), "Validator must be pre-staked");
            await expectRevert(() => stakeMegapoolValidatorAndAssert(current, "node", 0n), "Validator must be pre-staked");
            await expectRevert(() => megapool.dissolveValidator(0n), "Validator not prestaked");
        });
    }

    it("snapshots each deadline despite subsequent challenge-period changes", async () => {
        const current = await load().ensure("current");
        await depositAndAssign(current);
        const megapool = await pool(current);
        const deadline = await megapool.getValidatorChallengeDeadline(0n);
        await current.pdao.settings.megapools.setUint(PERIOD_PATH, PERIOD * 2n);
        await depositAndAssign(current);
        assert.equal(await megapool.getValidatorChallengeDeadline(0n), deadline);
        const second = await megapool.getValidatorInfo(1n);
        assert.equal(await megapool.getValidatorChallengeDeadline(1n), second.lastAssignmentTime + PERIOD * 2n);
        await current.pdao.settings.megapools.setUint(PERIOD_PATH, PERIOD);
        assert.equal(await megapool.getValidatorChallengeDeadline(1n), second.lastAssignmentTime + PERIOD * 2n);
        await setTime(deadline);
        await (await megapool.stakeWithoutProof(0n)).wait();
        await expectRevert(() => megapool.stakeWithoutProof(1n), "Challenge period has not elapsed");
    });

    it("pauses only proofless staking while clocks, proven staking and dissolution continue", async () => {
        const current = await load().ensure("current");
        await depositAndAssign(current, 4);
        const megapool = await pool(current);
        const deadline = await megapool.getValidatorChallengeDeadline(0n);
        await enabled(current, false);
        await stakeMegapoolValidatorAndAssert(current, "node", 1n);
        await cleared(current, 1n);
        await dissolveMegapoolValidatorAndAssert(current, "node", 2n, { caller: "node", proofOverrides: { slashed: true } });
        await cleared(current, 2n);
        await current.time.advance(await current.pdao.settings.megapools.getTimeBeforeDissolve() + 1n);
        await expectRevert(() => megapool.stakeWithoutProof(0n), "Proofless staking is disabled");
        await dissolveMegapoolValidatorAndAssert(current, "node", 3n, { caller: "random" });
        await cleared(current, 3n);
        assert.equal(await megapool.getValidatorChallengeDeadline(0n), deadline);
        await enabled(current, true);
        await (await megapool.stakeWithoutProof(0n)).wait();
        await expectRevert(() => megapool.stakeWithoutProof(2n), "Validator must be pre-staked");
        await expectRevert(() => megapool.stakeWithoutProof(3n), "Validator must be pre-staked");
    });

    it("clears cancellation data and rejects a cancelled validator", async () => {
        const current = await load().ensure("current");
        await current.megapools.deposit("node");
        await current.megapools.dequeue("node", 0n);
        await cleared(current);
        await expectRevert(async () => (await pool(current)).stakeWithoutProof(0n), "Validator must be pre-staked");
    });

    it("allows proof-based staking before the deadline and clears retained data", async () => {
        const current = await load().ensure("current");
        await depositAndAssign(current);
        const megapool = await pool(current);
        assert(await current.time.latest() < await megapool.getValidatorChallengeDeadline(0n));
        await stakeMegapoolValidatorAndAssert(current, "node", 0n);
        await cleared(current);
        await expectRevert(() => megapool.stakeWithoutProof(0n), "Validator must be pre-staked");
    });

    it("rolls back signature cleanup, reservation, deadline, accounting and state if the deposit fails", async () => {
        const current = await load().ensure("current");
        await depositAndAssign(current);
        const megapool = await pool(current);
        const state = Array.from(await megapool.getValidatorInfo(0n));
        const signature = await megapool.getValidatorPrestakeSignature(0n);
        const deadline = await megapool.getValidatorChallengeDeadline(0n);
        const assigned = await megapool.getAssignedValue();
        const reserved = await megapool.getReservedPrestakeBond();
        const balance = await ethers.provider.getBalance(await megapool.getAddress());
        const casper = await current.contracts.rocketStorage.getFunction("getAddress")(id("contract.addresscasperDeposit"));
        const code = await ethers.provider.getCode(casper);
        await network.provider.send("hardhat_setCode", [casper, "0x60006000fd"]);
        try {
            await setTime(deadline);
            await expectRevert(() => megapool.stakeWithoutProof(0n, { gasLimit: 3_000_000 }));
            assert.deepEqual(Array.from(await megapool.getValidatorInfo(0n)), state);
            assert.equal(await megapool.getValidatorPrestakeSignature(0n), signature);
            assert.equal(await megapool.getValidatorChallengeDeadline(0n), deadline);
            assert.equal(await megapool.getAssignedValue(), assigned);
            assert.equal(await megapool.getReservedPrestakeBond(), reserved);
            assert.equal(await ethers.provider.getBalance(await megapool.getAddress()), balance);
        } finally {
            await network.provider.send("hardhat_setCode", [casper, code]);
        }
        await (await megapool.stakeWithoutProof(0n)).wait();
        assert.equal(await megapool.getReservedPrestakeBond(), 0n);
    });

    it("enforces settings guardrails and rejects direct unauthorized changes", async () => {
        const current = await load().ensure("current");
        const settings = current.contracts.rocketDAOProtocolSettingsMegapool;
        assert.equal(await settings.getStakeWithoutProofEnabled(), true);
        assert.equal(await settings.getPrestakeChallengePeriod(), PERIOD);
        await expectRevert(() => current.pdao.settings.megapools.setUint(PERIOD_PATH, PERIOD - 1n), "Challenge period must be >= 12 hours");
        const timeout = await settings.getTimeBeforeDissolve();
        for (const value of [timeout, timeout + 1n]) {
            await expectRevert(() => current.pdao.settings.megapools.setUint(PERIOD_PATH, value), "Challenge period must be below dissolution timeout");
        }
        await current.pdao.settings.megapools.setUint(PERIOD_PATH, 11n * 86400n);
        for (const value of [10n * 86400n, 11n * 86400n]) {
            await expectRevert(() => current.pdao.settings.megapools.setUint("megapool.time.before.dissolve", value), "Dissolution timeout must exceed challenge period");
        }
        await current.pdao.settings.megapools.setUint("megapool.time.before.dissolve", 11n * 86400n + 1n);
        const random = await current.context.actor("random");
        await expectRevert(() => settings.connect(random).setSettingBool(ENABLED_PATH, false), "Only DAO Protocol Proposals contract");
        await expectRevert(() => settings.connect(random).setSettingUint(PERIOD_PATH, PERIOD), "Only DAO Protocol Proposals contract");
    });
});
