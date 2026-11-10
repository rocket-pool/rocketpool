import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { bls12_381 as bls } from "@noble/curves/bls12-381";
import { id, parseEther, solidityPackedKeccak256 } from "ethers";

import { before, describe, expectRevert, it, load, asNetworkContract, type ProtocolCurrent } from "../../harness";
import { RocketMegapoolDelegate__factory } from "../../harness/bindings/current";
import { ethers, network } from "../../../test-old/_utils/hardhat-runtime";
import { stakeMegapoolValidatorAndAssert } from "../../scenarios/megapool/stake-validator";
import { notifyMegapoolExitAndAssert } from "../../scenarios/megapool/notify-exit";
import { finaliseMegapoolValidatorAndAssert } from "../../scenarios/megapool/finalise-validator";
import { dissolveMegapoolValidatorAndAssert } from "../../scenarios/megapool/dissolve-validator";
import { currentEpoch } from "../../scenarios/megapool/proofs";
import { ETHER, prepareMegapoolProtocol } from "./fixtures";

const PERIOD = 12n * 60n * 60n;
const POP = { DST: "BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_" };
const bytes = (s: string) => Buffer.from(s.slice(2), "hex");
const hex = (b: Uint8Array) => `0x${Buffer.from(b).toString("hex")}`;
const sha = (...parts: Uint8Array[]) => createHash("sha256").update(Buffer.concat(parts)).digest();
const zero = Buffer.alloc(32);
const MAINNET_DOMAIN = "0x03000000f5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a9";

async function pool(p: ProtocolCurrent, node = "node") {
    return RocketMegapoolDelegate__factory.connect(await p.megapools.address(node), await p.context.actor(node));
}

async function assertReservations(p: ProtocolCurrent, expected?: bigint) {
    const megapool = await pool(p);
    let total = 0n;
    for (let i = 0n; i < await megapool.getValidatorCount(); i++) {
        const info = await megapool.getValidatorInfo(i);
        const deadline = await megapool.getValidatorChallengeDeadline(i);
        if (deadline !== 0n) {
            assert.equal(info.inPrestake, true);
            total += info.lastRequestedBond * 10n ** 15n;
        }
    }
    assert.equal(await megapool.getReservedPrestakeBond(), total);
    assert(total <= await megapool.getNodeBond());
    if (expected !== undefined) assert.equal(total, expected);
}

type SignatureKind = "valid" | "wrong-key" | "wrong-amount" | "wrong-credentials" | "wrong-domain" | "malformed";
async function deposit(p: ProtocolCurrent, kind: SignatureKind = "wrong-key", bond = 4n * ETHER) {
    const megapool = await pool(p);
    const index = await megapool.getValidatorCount();
    const key = 42n + index;
    const pubkey = bls.getPublicKey(key);
    const credentials = bytes(await megapool.getWithdrawalCredentials());
    const amount = Buffer.alloc(32);
    amount.writeBigUInt64LE(1_000_000_000n);
    const signedAmount = Buffer.from(amount);
    if (kind === "wrong-amount") signedAmount.writeBigUInt64LE(32_000_000_000n);
    const pubkeyRoot = sha(pubkey, Buffer.alloc(16));
    const messageRoot = sha(sha(pubkeyRoot, kind === "wrong-credentials" ? zero : credentials), sha(signedAmount, zero));
    const signingRoot = sha(messageRoot, kind === "wrong-domain" ? zero : bytes(MAINNET_DOMAIN));
    const signature = kind === "malformed" ? Buffer.alloc(96) : bls.Signature.toRawBytes(
        bls.G2.ProjectivePoint.fromAffine(bls.G2.hashToCurve(signingRoot, POP).toAffine()).multiply(kind === "wrong-key" ? key + 100n : key),
    );
    const signatureRoot = sha(sha(signature.subarray(0, 64)), sha(signature.subarray(64), zero));
    const dataRoot = sha(sha(pubkeyRoot, credentials), sha(amount, signatureRoot));
    await (await p.contracts.rocketNodeDeposit.connect(await p.context.actor("node")).deposit(
        bond, false, hex(pubkey), hex(signature), hex(dataRoot), { value: bond },
    )).wait();
    await assertReservations(p);
    return index;
}

async function challenge(p: ProtocolCurrent, index = 0n, caller = "node2") {
    return p.contracts.rocketMegapoolManager.connect(await p.context.actor(caller)).challengeInvalidSignature(await p.megapools.address("node"), index);
}

async function state(p: ProtocolCurrent, index = 0n) {
    const megapool = await pool(p);
    const node = await p.nodes.address("node");
    return {
        info: Array.from(await megapool.getValidatorInfo(index)),
        signature: await megapool.getValidatorPrestakeSignature(index),
        deadline: await megapool.getValidatorChallengeDeadline(index),
        nodeBond: await megapool.getNodeBond(), userCapital: await megapool.getUserCapital(),
        reserved: await megapool.getReservedPrestakeBond(),
        assigned: await megapool.getAssignedValue(), debt: await megapool.getDebt(),
        refund: await megapool.getRefundValue(), active: await megapool.getActiveValidatorCount(),
        balance: await ethers.provider.getBalance(await megapool.getAddress()),
        depositBalance: await p.contracts.rocketDepositPool.getBalance(),
        credit: await p.contracts.rocketDepositPool.getNodeCreditBalance(await p.nodes.address("node2")),
        globalBond: await p.contracts.rocketNodeStaking.getNodeMegapoolETHBonded(node),
        globalBorrowed: await p.contracts.rocketNodeStaking.getNodeMegapoolETHBorrowed(node),
    };
}

async function exit(p: ProtocolCurrent, index: bigint) {
    await stakeMegapoolValidatorAndAssert(p, "node", index);
    await assertReservations(p);
    const wait = await p.contracts.rocketDAOProtocolSettingsMegapool.getNotifyThreshold() + 1n;
    const epoch = await currentEpoch(p) + wait;
    await notifyMegapoolExitAndAssert(p, "node", index, epoch);
    await p.time.advance(wait * 384n);
    await finaliseMegapoolValidatorAndAssert(p, "node", index, 32n * ETHER);
    await assertReservations(p);
}

describe("RocketMegapool invalid signature challenges", () => {
    before(async () => {
        const p = await prepareMegapoolProtocol();
        await p.megapools.deploy("node");
        await p.megapools.deploy("node2");
        await p.pdao.settings.network.setRethCollateralTarget(0n);
        await p.depositPool.fund("depositor", 400n * ETHER);
    });

    it("registers the real verifier with the genesis domain and matching upgrade indices", async () => {
        const p = await load().ensure("current");
        const address = await p.contracts.blsDepositVerifier.getAddress();
        assert.equal(await p.contracts.blsDepositVerifier.depositDomain(), MAINNET_DOMAIN);
        assert.equal(await p.contracts.rocketUpgradeOneDotFive.addresses(12), address);
        assert.equal(await p.contracts.rocketUpgradeOneDotFive.abis(12), await p.contracts.rocketStorage.getString(id("contract.abiblsDepositVerifier")));
        assert.equal(await p.contracts.rocketStorage.getFunction("getAddress")(id("contract.addressblsDepositVerifier")), address);
        assert.equal(await p.contracts.rocketStorage.getBool(solidityPackedKeccak256(["string", "address"], ["contract.exists", address])), true);
    });

    it("rejects a valid signature without changing any state", async () => {
        const p = await load().ensure("current");
        await deposit(p, "valid");
        const before = await state(p);
        await expectRevert(() => challenge(p), "Prestake signature is valid");
        assert.deepEqual(await state(p), before);
    });

    for (const kind of ["wrong-key", "wrong-amount", "wrong-credentials", "wrong-domain", "malformed"] as const) {
        it(`settles a ${kind} signature using the original bond and recycles all 31 ETH`, async () => {
            const p = await load().ensure("current");
            await deposit(p, kind);
            const before = await state(p);
            const receipt = await (await challenge(p)).wait();
            assert(receipt);
            const after = await state(p);
            const megapool = await pool(p);
            assert.equal((await megapool.getValidatorInfo(0n)).dissolved, true);
            assert.equal((await megapool.getValidatorInfo(0n)).inPrestake, false);
            assert.equal(after.signature, "0x");
            assert.equal(after.deadline, 0n);
            assert.equal(before.nodeBond - after.nodeBond, 4n * ETHER);
            assert.equal(before.userCapital - after.userCapital, 28n * ETHER);
            assert.equal(before.globalBond - after.globalBond, 4n * ETHER);
            assert.equal(before.globalBorrowed - after.globalBorrowed, 28n * ETHER);
            assert.equal(after.credit - before.credit, 3n * ETHER);
            assert.equal(after.depositBalance - before.depositBalance, 31n * ETHER);
            assert.equal(before.balance - after.balance, 31n * ETHER);
            assert.equal(before.assigned - after.assigned, 31n * ETHER);
            assert.equal(after.active, 0n);
            await assertReservations(p, 0n);
            assert.equal(after.refund, before.refund);
            assert.equal(after.debt - before.debt, await p.contracts.rocketDAOProtocolSettingsMegapool.getDissolvePenalty());
            assert(receipt.logs.some(log => log.topics[0] === id("InvalidSignatureChallenged(address,uint32,address)")));
            await expectRevert(() => challenge(p), "Validator not prestaked");
            await expectRevert(() => megapool.stakeWithoutProof(0n), "Validator must be pre-staked");
            await expectRevert(() => megapool.dissolveValidator(0n), "Validator not prestaked");
        });
    }

    it("restricts callers and targets and prevents bypassing manager verification", async () => {
        const p = await load().ensure("current");
        await deposit(p);
        await expectRevert(() => challenge(p, 0n, "random"), "Invalid node");
        await expectRevert(() => challenge(p, 0n, "trusted1"), "Challenger megapool must be deployed");
        await expectRevert(async () => p.contracts.rocketMegapoolManager.connect(await p.context.actor("node2")).challengeInvalidSignature(await p.nodes.address("node"), 0n), "Invalid megapool");
        await expectRevert(async () => (await pool(p)).dissolveInvalidValidator(0n, await p.nodes.address("node2")));
        await asNetworkContract(p, "rocketMegapoolManager", async signer => {
            await expectRevert(async () => (await pool(p)).connect(signer).dissolveInvalidValidator(0n, ethers.ZeroAddress), "Invalid challenger");
        });
        await expectRevert(() => challenge(p, 99n), "Validator does not exist");
    });

    it("rejects queued, staked, cancelled and timeout-dissolved validators", async () => {
        const p = await load().ensure("current");
        await p.pdao.settings.deposits.setAssignmentsEnabled(false);
        await deposit(p);
        await expectRevert(() => challenge(p), "Validator not prestaked");
        await p.megapools.dequeue("node", 0n);
        await expectRevert(() => challenge(p), "Validator not prestaked");
        await p.pdao.settings.deposits.setAssignmentsEnabled(true);
        await deposit(p);
        await stakeMegapoolValidatorAndAssert(p, "node", 1n);
        await expectRevert(() => challenge(p, 1n), "Validator not prestaked");
        await deposit(p);
        await p.time.advance(await p.pdao.settings.megapools.getTimeBeforeDissolve() + 1n);
        await (await (await pool(p)).dissolveValidator(2n)).wait();
        await expectRevert(() => challenge(p, 2n), "Validator not prestaked");
        assert.equal(await p.contracts.rocketDepositPool.getNodeCreditBalance(await p.nodes.address("node2")), 0n);
    });

    it("accepts overdue challenges while proofless staking and deposits are paused", async () => {
        const p = await load().ensure("current");
        await deposit(p);
        await p.pdao.bootstrap.setSetting({ contract: "rocketDAOProtocolSettingsMegapool", path: "megapool.stake.without.proof.enabled", value: { type: "bool", value: false } });
        await p.pdao.settings.deposits.setEnabled(false);
        await p.time.advance(PERIOD + 1n);
        await (await challenge(p)).wait();
        const dp = p.contracts.rocketDepositPool.connect(await p.context.actor("node2"));
        await expectRevert(() => dp.withdrawCredit(3n * ETHER), "Deposits into Rocket Pool are currently disabled");
        await p.pdao.settings.deposits.setEnabled(true);
        const fee = await p.depositPool.depositFee();
        const expected = await p.contracts.rocketTokenRETH.getRethValue(3n * ETHER - 3n * fee);
        const node = await p.nodes.address("node2");
        const before = await p.contracts.rocketTokenRETH.balanceOf(node);
        await (await dp.withdrawCredit(3n * ETHER)).wait();
        assert.equal(await p.contracts.rocketTokenRETH.balanceOf(node) - before, expected);
        assert.equal(await dp.getNodeCreditBalance(node), 0n);
    });

    it("allows self-challenges but retains the debt restriction on credit withdrawal", async () => {
        const p = await load().ensure("current");
        await deposit(p);
        await (await challenge(p, 0n, "node")).wait();
        const dp = p.contracts.rocketDepositPool.connect(await p.context.actor("node"));
        assert.equal(await dp.getNodeCreditBalance(await p.nodes.address("node")), 3n * ETHER);
        await expectRevert(() => dp.withdrawCredit(3n * ETHER), "Cannot withdraw credit while debt exists");
    });

    it("preserves unrelated debt and still awards a challenger whose own pool has debt", async () => {
        const p = await load().ensure("current");
        await deposit(p);
        await asNetworkContract(p, "rocketMegapoolPenalties", async signer => {
            await (await (await pool(p)).connect(signer).applyPenalty(ETHER)).wait();
            await (await (await pool(p, "node2")).connect(signer).applyPenalty(ETHER)).wait();
        });
        await (await challenge(p)).wait();
        assert.equal(await (await pool(p)).getDebt(), ETHER + await p.contracts.rocketDAOProtocolSettingsMegapool.getDissolvePenalty());
        assert.equal(await p.contracts.rocketDepositPool.getNodeCreditBalance(await p.nodes.address("node2")), 3n * ETHER);
        await expectRevert(async () => p.contracts.rocketDepositPool.connect(await p.context.actor("node2")).withdrawCredit(3n * ETHER), "Cannot withdraw credit while debt exists");
    });

    it("records timeout capital shortfalls after pending rewards repay the dissolution penalty", async () => {
        const p = await load().ensure("current");
        await p.pdao.settings.nodes.setReducedBond(parseEther("1.1"));
        await deposit(p); await deposit(p);
        await deposit(p, "valid", parseEther("1.1")); await deposit(p, "valid", parseEther("1.1"));
        await p.pdao.settings.nodes.setReducedBond(4n * ETHER);
        const megapool = await pool(p);
        await (await (await p.context.actor("depositor")).sendTransaction({ to: await megapool.getAddress(), value: 2n * ETHER })).wait();
        await p.time.advance(await p.pdao.settings.megapools.getTimeBeforeDissolve() + 1n);
        await (await megapool.dissolveValidator(3n)).wait();
        // The snapshot repays the penalty, then the retired user capital incurs a 1 ETH shortfall.
        assert.equal(await megapool.getDebt(), ETHER);
        assert.equal(await megapool.getRefundValue(), 2n * ETHER - await p.contracts.rocketDAOProtocolSettingsMegapool.getDissolvePenalty());
        await assertReservations(p, parseEther("9.1"));
    });

    it("keeps the 0.1 ETH reward after governance raises the bond requirement", async () => {
        const p = await load().ensure("current");
        await p.pdao.settings.nodes.setReducedBond(parseEther("1.1"));
        await deposit(p); await deposit(p); await deposit(p, "valid", parseEther("1.1"));
        await deposit(p, "wrong-key", parseEther("1.1"));
        await p.pdao.settings.nodes.setReducedBond(4n * ETHER);
        await (await challenge(p, 3n)).wait();
        const megapool = await pool(p);
        assert.equal(await p.contracts.rocketDepositPool.getNodeCreditBalance(await p.nodes.address("node2")), parseEther("0.1"));
        assert.equal(await megapool.getNodeBond(), parseEther("9.1"));
        assert.equal(await megapool.getDebt(), await p.contracts.rocketDAOProtocolSettingsMegapool.getDissolvePenalty());
        assert.equal(await megapool.getActiveValidatorCount(), 3n);
    });

    it("returns unrelated surplus node capital as credit after paying the dissolution penalty", async () => {
        const p = await load().ensure("current");
        await p.pdao.settings.nodes.setReducedBond(parseEther("1.1"));
        await deposit(p, "valid"); await deposit(p, "valid"); await deposit(p, "wrong-key", parseEther("1.1"));
        await exit(p, 0n); await exit(p, 1n);
        const megapool = await pool(p);
        assert.equal(await megapool.getNodeBond(), 4n * ETHER);
        await (await challenge(p, 2n)).wait();
        const penalty = await p.contracts.rocketDAOProtocolSettingsMegapool.getDissolvePenalty();
        assert.equal(await p.contracts.rocketDepositPool.getNodeCreditBalance(await p.nodes.address("node2")), parseEther("0.1"));
        assert.equal(await p.contracts.rocketDepositPool.getNodeCreditBalance(await p.nodes.address("node")), parseEther("2.9") - penalty);
        assert.equal(await megapool.getDebt(), 0n);
        assert.equal(await megapool.getNodeBond(), 0n);
        assert.equal(await megapool.getUserCapital(), 0n);
    });

    it("preserves the entire original bond while other exits return and claim only unreserved capital", async () => {
        const p = await load().ensure("current");
        await p.pdao.settings.nodes.setReducedBond(parseEther("1.1"));
        await deposit(p, "valid"); await deposit(p, "valid");
        await p.pdao.settings.nodes.setReducedBond(4n * ETHER);
        await deposit(p, "valid", 4n * ETHER);
        await p.pdao.settings.nodes.setReducedBond(parseEther("1.1"));
        // Force a larger original deposit using a fourth validator after raising the requirement.
        await deposit(p, "valid", parseEther("1.1"));
        await p.pdao.settings.nodes.setReducedBond(4n * ETHER);
        const bond = await (await pool(p)).getNewValidatorBondRequirement();
        await deposit(p, "wrong-key", bond);
        assert.equal(bond, parseEther("6.9"));
        await p.pdao.settings.nodes.setReducedBond(parseEther("1.1"));
        const withdrawal = await p.context.actorAddress("nodeWithdrawal");
        const balanceBefore = await ethers.provider.getBalance(withdrawal);
        for (const index of [0n, 1n, 2n, 3n]) await exit(p, index);
        const megapool = await pool(p);
        assert.equal(await megapool.getNodeBond(), bond);
        await assertReservations(p, bond);
        assert.equal(await ethers.provider.getBalance(withdrawal) - balanceBefore, parseEther("13.1"));
        // Unrelated refunds remain claimable; the challenged bond never became a refund.
        assert.equal(await megapool.getDebt(), 0n);
        await (await megapool.claim()).wait();
        assert.equal(await megapool.getRefundValue(), 0n);
        await (await challenge(p, 4n)).wait();
        assert.equal(await p.contracts.rocketDepositPool.getNodeCreditBalance(await p.nodes.address("node2")), bond - ETHER);
        assert.equal(await megapool.getDebt(), await p.contracts.rocketDAOProtocolSettingsMegapool.getDissolvePenalty());
        assert.equal(await megapool.getNodeBond(), 0n);
        assert.equal(await megapool.getUserCapital(), 0n);
        await assertReservations(p, 0n);
    });

    for (const order of [[0, 1, 2, 3, 4], [4, 3, 2, 1, 0], [2, 0, 4, 1, 3]]) {
        it(`releases each reservation exactly once across mixed lifecycle order ${order.join(",")}`, async () => {
            const p = await load().ensure("current");
            const megapool = await pool(p);
            for (let i = 0; i < 5; i++) await deposit(p, i === 4 ? "wrong-key" : "valid");
            await assertReservations(p, 20n * ETHER);
            await p.pdao.settings.deposits.setAssignmentsEnabled(false);
            await deposit(p, "valid");
            await assertReservations(p, 20n * ETHER); // Queuing and cancellation do not reserve bond.
            await p.megapools.dequeue("node", 5n);
            await assertReservations(p, 20n * ETHER);
            await p.pdao.settings.deposits.setAssignmentsEnabled(true);
            await p.time.advance(await p.pdao.settings.megapools.getTimeBeforeDissolve() + 1n);
            const actions = [
                () => stakeMegapoolValidatorAndAssert(p, "node", 0n),
                async () => { await (await megapool.stakeWithoutProof(1n)).wait(); },
                async () => { await (await megapool.dissolveValidator(2n)).wait(); },
                () => dissolveMegapoolValidatorAndAssert(p, "node", 3n, { caller: "node2", proofOverrides: { slashed: true } }),
                async () => { await (await challenge(p, 4n)).wait(); },
            ];
            let remaining = 5n;
            for (const index of order) {
                await actions[index]!();
                await assertReservations(p, --remaining * 4n * ETHER);
                await expectRevert(actions[index]!);
                await assertReservations(p, remaining * 4n * ETHER);
            }
        });
    }

    for (const path of ["timeout", "proof"] as const) {
        it(`keeps other reservations intact during ${path} dissolution after a bond reduction`, async () => {
            const p = await load().ensure("current");
            for (let i = 0; i < 4; i++) await deposit(p);
            await p.pdao.settings.nodes.setReducedBond(parseEther("1.1"));
            if (path === "timeout") {
                await p.time.advance(await p.pdao.settings.megapools.getTimeBeforeDissolve() + 1n);
                await (await (await pool(p)).dissolveValidator(0n)).wait();
            } else {
                await dissolveMegapoolValidatorAndAssert(p, "node", 0n, { caller: "node2", proofOverrides: { slashed: true } });
            }
            await assertReservations(p, 12n * ETHER);
            assert.equal(await (await pool(p)).getNodeBond(), 12n * ETHER);
            for (const i of [1n, 2n, 3n]) {
                await (await challenge(p, i)).wait();
                await assertReservations(p, (3n - i) * 4n * ETHER);
            }
            assert.equal(await p.contracts.rocketDepositPool.getNodeCreditBalance(await p.nodes.address("node2")), (path === "proof" ? 12n : 9n) * ETHER);
        });
    }

    it("protects a prestake bond when another validator's exit incurs a loss", async () => {
        const p = await load().ensure("current");
        for (let i = 0; i < 4; i++) await deposit(p, i === 0 ? "valid" : "wrong-key");
        await p.pdao.settings.nodes.setReducedBond(parseEther("1.1"));
        await stakeMegapoolValidatorAndAssert(p, "node", 0n);
        const wait = await p.contracts.rocketDAOProtocolSettingsMegapool.getNotifyThreshold() + 1n;
        await notifyMegapoolExitAndAssert(p, "node", 0n, await currentEpoch(p) + wait);
        await p.time.advance(wait * 384n);
        await finaliseMegapoolValidatorAndAssert(p, "node", 0n, 27n * ETHER);
        await assertReservations(p, 12n * ETHER);
        assert.equal(await (await pool(p)).getDebt(), ETHER);
        await (await challenge(p, 1n)).wait();
        await assertReservations(p, 8n * ETHER);
        assert.equal(await (await pool(p)).getDebt(), ETHER + await p.contracts.rocketDAOProtocolSettingsMegapool.getDissolvePenalty());
        assert.equal(await p.contracts.rocketDepositPool.getNodeCreditBalance(await p.nodes.address("node2")), 3n * ETHER);
    });

    it("allows reward withdrawals while another validator's bond is reserved", async () => {
        const p = await load().ensure("current");
        await deposit(p, "valid"); await deposit(p, "valid");
        await stakeMegapoolValidatorAndAssert(p, "node", 0n);
        const megapool = await pool(p);
        await (await (await p.context.actor("depositor")).sendTransaction({ to: await megapool.getAddress(), value: ETHER })).wait();
        const withdrawal = await p.context.actorAddress("nodeWithdrawal");
        const before = await ethers.provider.getBalance(withdrawal);
        await (await megapool.distribute()).wait();
        assert(await ethers.provider.getBalance(withdrawal) > before);
        assert.equal(await megapool.getRefundValue(), 0n);
        await assertReservations(p, 4n * ETHER);
    });

    for (const mode of ["revert", "empty-result", "low-gas"] as const) {
        it(`rolls back a ${mode} verification failure without rewarding or dissolving`, async () => {
            const p = await load().ensure("current");
            await deposit(p, "valid");
            const before = await state(p);
            const address = await p.contracts.blsDepositVerifier.getAddress();
            const code = await ethers.provider.getCode(address);
            try {
                if (mode !== "low-gas") await network.provider.send("hardhat_setCode", [address, mode === "revert" ? "0x60006000fd" : "0x00"]);
                await expectRevert(async () => p.contracts.rocketMegapoolManager.connect(await p.context.actor("node2")).challengeInvalidSignature(await p.megapools.address("node"), 0n, { gasLimit: mode === "low-gas" ? 200_000 : 5_000_000 }));
            } finally {
                await network.provider.send("hardhat_setCode", [address, code]);
            }
            assert.deepEqual(await state(p), before);
        });
    }

    it("rolls back the entire settlement if recycling the funds fails", async () => {
        const p = await load().ensure("current");
        await deposit(p);
        const before = await state(p);
        const vault = await p.contracts.rocketVault.getAddress();
        const code = await ethers.provider.getCode(vault);
        try {
            await network.provider.send("hardhat_setCode", [vault, "0x60006000fd"]);
            await expectRevert(() => challenge(p));
        } finally {
            await network.provider.send("hardhat_setCode", [vault, code]);
        }
        assert.deepEqual(await state(p), before);
    });
});
