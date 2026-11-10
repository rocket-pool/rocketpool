import assert from "node:assert/strict";
import { ZeroHash, toBeHex } from "ethers";
import { before, describe, expectRevert, it, load, type ProtocolCurrent } from "../../harness";
import { RocketMegapoolDelegate__factory } from "../../harness/bindings/current";
import { GLOAS_TEST_SLOT } from "../../harness/deployment";
import { ethers, network } from "../../../test-old/_utils/hardhat-runtime";
import { currentSlot } from "../../scenarios/megapool/proofs";
import { depositDataRoot, encodePendingDepositProof, pendingDepositProof, signedPendingDeposit, WRONG_CREDENTIALS, type PendingProof } from "../../scenarios/megapool/pending-deposit-proof";
import { ETHER, prepareMegapoolProtocol } from "./fixtures";

async function pool(p: ProtocolCurrent) {
    return RocketMegapoolDelegate__factory.connect(await p.megapools.address("node"), await p.context.actor("node"));
}
async function submit(p: ProtocolCurrent, proof: PendingProof, caller = "node2", validatorId = 0n) {
    return p.contracts.rocketMegapoolManager.connect(await p.context.actor(caller)).dissolvePendingDeposit(
        await p.megapools.address("node"), validatorId, proof.timestamp, 1n, encodePendingDepositProof(proof),
    );
}
async function verify(p: ProtocolCurrent, proof: PendingProof) {
    return p.contracts.beaconStateVerifier.verifyPendingDeposit(proof.timestamp, 1n, encodePendingDepositProof(proof));
}
async function state(p: ProtocolCurrent) {
    const mp = await pool(p);
    const node = await p.nodes.address("node");
    return {
        info: Array.from(await mp.getValidatorInfo(0n)),
        reserved: await mp.getReservedPrestakeBond(), bond: await mp.getNodeBond(), user: await mp.getUserCapital(),
        assigned: await mp.getAssignedValue(), refund: await mp.getRefundValue(), debt: await mp.getDebt(),
        signature: await mp.getValidatorPrestakeSignature(0n), deadline: await mp.getValidatorChallengeDeadline(0n),
        credit: await p.contracts.rocketDepositPool.getNodeCreditBalance(await p.nodes.address("node2")),
        depositBalance: await p.contracts.rocketDepositPool.getBalance(),
        balance: await ethers.provider.getBalance(await mp.getAddress()),
        globalBond: await p.contracts.rocketNodeStaking.getNodeMegapoolETHBonded(node),
        globalBorrowed: await p.contracts.rocketNodeStaking.getNodeMegapoolETHBorrowed(node),
    };
}

const ELECTRA = 364032n * 32n;
const FULU = 411392n * 32n;
const GLOAS = GLOAS_TEST_SLOT;
const corrupt = (witnesses: string[], index: number) => { witnesses[index] = toBeHex(BigInt(witnesses[index]) ^ 1n, 32); };

describe("RocketMegapool pending deposit proofs", () => {
    before(async () => {
        const p = await prepareMegapoolProtocol();
        await (await p.contracts.beaconStateVerifier.connect(await p.context.actor("node")).setDisabled(false)).wait();
        await p.megapools.deploy("node");
        await p.megapools.deploy("node2");
        await p.pdao.settings.network.setRethCollateralTarget(0n);
        await p.depositPool.fund("depositor", 56n * ETHER);
        const credentials = await (await pool(p)).getWithdrawalCredentials();
        for (const key of [42n, 43n]) {
            const deposit = signedPendingDeposit(key, credentials, 1_000_000_000n);
            await (await p.contracts.rocketNodeDeposit.connect(await p.context.actor("node")).deposit(
                4n * ETHER, false, deposit.pubkey, deposit.signature, depositDataRoot(deposit), { value: 4n * ETHER },
            )).wait();
        }
    });

    const paths = [
        ["Electra direct", ELECTRA, ELECTRA, 0n],
        ["Fulu direct", FULU, FULU, 134217727n],
        ["Gloas direct", GLOAS, GLOAS, 5n],
        ["pre-Gloas recent", FULU + 100n, FULU, 4n],
        ["Gloas recent", GLOAS + 100n, GLOAS, 20n],
        ["fork transition recent", GLOAS, GLOAS - 1n, 21n],
        ["ring boundary", GLOAS + 8192n, GLOAS, 1n],
        ["first historical slot", GLOAS + 8193n, GLOAS, 85n],
        ["pre-Gloas historical", FULU + 20000n, ELECTRA, 6n],
        ["cross-fork historical", GLOAS + 20000n, FULU, 7n],
        ["Gloas historical", GLOAS + 20000n, GLOAS, 84n],
    ] as const;
    for (const [label, anchorSlot, stateSlot, depositIndex] of paths) {
        it(`authenticates and rewards a ${label} proof`, async () => {
            const p = await load().ensure("current");
            const deposit = signedPendingDeposit(42n, WRONG_CREDENTIALS, 2_000_000_000n, stateSlot - 1n);
            const proof = await pendingDepositProof(p, deposit, { anchorSlot, stateSlot, depositIndex });
            const facts = await verify(p, proof);
            assert.equal(facts.stateSlot, stateSlot);
            assert.equal(facts.slot, anchorSlot);
            assert.equal(facts.depositIndex, depositIndex);
            assert.equal(facts.deposit.signature, deposit.signature);
            assert.equal(facts.deposit.amountInGwei, 2_000_000_000n);
            const before = await state(p);
            await (await submit(p, proof)).wait();
            const after = await state(p);
            assert.equal((await (await pool(p)).getValidatorInfo(0n)).dissolved, true);
            assert.equal(after.reserved, 4n * ETHER);
            assert.equal(after.bond, 4n * ETHER);
            assert.equal(after.user, 28n * ETHER);
            assert.equal(after.assigned, 31n * ETHER);
            assert.equal(before.globalBond - after.globalBond, 4n * ETHER);
            assert.equal(before.globalBorrowed - after.globalBorrowed, 28n * ETHER);
            assert.equal(after.credit - before.credit, 3n * ETHER);
            assert.equal(after.depositBalance - before.depositBalance, 31n * ETHER);
            assert.equal(before.balance - after.balance, 31n * ETHER);
            assert.equal(after.refund, before.refund);
            assert.equal(after.debt - before.debt, await p.contracts.rocketDAOProtocolSettingsMegapool.getDissolvePenalty());
            assert.equal(after.signature, "0x");
            assert.equal(after.deadline, 0n);
            await expectRevert(() => submit(p, proof), "Validator not prestaked");
            assert.deepEqual(await state(p), after);
        });
    }

    const changes: [string, (proof: PendingProof) => void][] = [
        ["pubkey", p => { p.pendingDepositProof.deposit.pubkey = signedPendingDeposit(44n).pubkey; }],
        ["credentials", p => { p.pendingDepositProof.deposit.withdrawalCredentials = ZeroHash; }],
        ["amount", p => { p.pendingDepositProof.deposit.amountInGwei++; }],
        ["signature", p => { p.pendingDepositProof.deposit.signature = signedPendingDeposit(44n).signature; }],
        ["deposit slot", p => { p.pendingDepositProof.deposit.slot++; }],
        ["list index", p => { p.pendingDepositProof.depositIndex--; }],
        ["state slot", p => { p.pendingDepositProof.stateSlot--; }],
        ["anchor slot", p => { p.slotProof.slot++; }],
        ["list witness", p => { corrupt(p.pendingDepositProof.witnesses, 0); }],
        ["historical witness", p => { corrupt(p.pendingDepositProof.witnesses, p.pendingDepositProof.witnesses.length - 5); }],
        ["slot witness", p => { corrupt(p.slotProof.witnesses, p.slotProof.witnesses.length - 1); }],
        ["missing witness", p => { p.pendingDepositProof.witnesses.pop(); }],
        ["extra witness", p => { p.pendingDepositProof.witnesses.push(ZeroHash); }],
        ["short pubkey", p => { p.pendingDepositProof.deposit.pubkey = "0x01"; }],
        ["short signature", p => { p.pendingDepositProof.deposit.signature = "0x01"; }],
    ];
    for (const [label, mutate] of changes) {
        it(`rejects a tampered ${label} without changing accounting`, async () => {
            const p = await load().ensure("current");
            const slot = await currentSlot(p);
            const proof = await pendingDepositProof(p, signedPendingDeposit(), { stateSlot: slot - 20000n });
            const before = await state(p);
            mutate(proof);
            await expectRevert(() => submit(p, proof));
            assert.deepEqual(await state(p), before);
        });
    }

    for (const anchorSlot of [FULU, GLOAS]) {
        it(`rejects an index outside the authenticated list length at slot ${anchorSlot}`, async () => {
            const p = await load().ensure("current");
            // Even a root containing nonzero padding must not establish list membership.
            const proof = await pendingDepositProof(p, signedPendingDeposit(), { anchorSlot, depositIndex: 5n, depositCount: 5n });
            await expectRevert(() => verify(p, proof), "Invalid deposit index");
        });
    }

    it("rejects pre-Electra evidence, future states, invalid bounded indices and unsupported versions", async () => {
        const p = await load().ensure("current");
        const proof = await pendingDepositProof(p, signedPendingDeposit(), { anchorSlot: ELECTRA - 1n });
        await expectRevert(() => verify(p, proof), "Invalid proof");
        const currentProof = await pendingDepositProof(p, signedPendingDeposit(), { anchorSlot: FULU });
        currentProof.pendingDepositProof.stateSlot = ELECTRA - 1n;
        await expectRevert(() => verify(p, currentProof), "Invalid proof");
        currentProof.pendingDepositProof.stateSlot = FULU + 1n;
        await expectRevert(() => verify(p, currentProof), "Invalid slot for proof");
        currentProof.pendingDepositProof.stateSlot = FULU;
        currentProof.pendingDepositProof.depositIndex = 2n ** 27n;
        await expectRevert(() => verify(p, currentProof), "Index exceeds length");
        await expectRevert(() => p.contracts.beaconStateVerifier.verifyPendingDeposit(proof.timestamp, 2n, encodePendingDepositProof(proof)), "Unsupported proof version");
        await expectRevert(() => p.contracts.beaconStateVerifier.verifyPendingDeposit(proof.timestamp, 1n, "0x"));
    });

    it("rejects a historical state encoded using the anchor's fork layout", async () => {
        const p = await load().ensure("current");
        // The Gloas anchor is authentic, but this incorrectly encodes a Fulu state as progressive SSZ.
        const proof = await pendingDepositProof(p, signedPendingDeposit(), { anchorSlot: GLOAS, stateSlot: GLOAS - 1n, gloasSlot: FULU });
        await expectRevert(() => verify(p, proof));
    });

    it("requires a fresh anchor even when the historical evidence is valid", async () => {
        const p = await load().ensure("current");
        const slot = await currentSlot(p);
        const proof = await pendingDepositProof(p, signedPendingDeposit(), { stateSlot: slot - 20000n });
        await p.time.advance(3601n);
        await expectRevert(() => submit(p, proof), "Slot proof too old");
        const fresh = await pendingDepositProof(p, signedPendingDeposit(), { stateSlot: slot - 20000n });
        await (await submit(p, fresh)).wait();
    });

    for (const kind of ["wrong key", "wrong amount", "wrong credentials", "wrong domain", "malformed"] as const) {
        it(`rejects an authenticated pending deposit with a ${kind} signature`, async () => {
            const p = await load().ensure("current");
            const deposit = signedPendingDeposit();
            if (kind === "wrong key") deposit.signature = signedPendingDeposit(43n).signature;
            if (kind === "wrong amount") deposit.signature = signedPendingDeposit(42n, WRONG_CREDENTIALS, 1_000_000_000n).signature;
            if (kind === "wrong credentials") deposit.signature = signedPendingDeposit(42n, ZeroHash).signature;
            if (kind === "wrong domain") deposit.signature = signedPendingDeposit(42n, WRONG_CREDENTIALS, 2_000_000_000n, 0n, ZeroHash).signature;
            if (kind === "malformed") deposit.signature = `0x${"00".repeat(96)}`;
            const proof = await pendingDepositProof(p, deposit);
            await verify(p, proof); // The Merkle proof authenticates the invalid signature, but does not validate it.
            const before = await state(p);
            await expectRevert(() => submit(p, proof), "Invalid pending deposit signature");
            assert.deepEqual(await state(p), before);
        });
    }

    it("rejects a valid deposit for another pubkey or the correct withdrawal credentials", async () => {
        const p = await load().ensure("current");
        const other = await pendingDepositProof(p, signedPendingDeposit(43n));
        await expectRevert(() => submit(p, other), "Pubkey does not match");
        const correct = await pendingDepositProof(p, signedPendingDeposit(42n, await (await pool(p)).getWithdrawalCredentials()));
        await expectRevert(() => submit(p, correct), "Correct withdrawal credentials");
    });

    it("restricts rewarded challengers and rejects unregistered megapools", async () => {
        const p = await load().ensure("current");
        const proof = await pendingDepositProof(p, signedPendingDeposit());
        const before = await state(p);
        await expectRevert(() => submit(p, proof, "random"), "Invalid node");
        await expectRevert(() => submit(p, proof, "trusted1"), "Challenger megapool must be deployed");
        await expectRevert(async () => p.contracts.rocketMegapoolManager.connect(await p.context.actor("node2")).dissolvePendingDeposit(await p.nodes.address("node"), 0n, proof.timestamp, 1n, encodePendingDepositProof(proof)), "Invalid megapool");
        assert.deepEqual(await state(p), before);
    });

    it("accepts later conflicting deposits and overdue challenges while proofless staking is paused", async () => {
        const p = await load().ensure("current");
        await p.pdao.bootstrap.setSetting({ contract: "rocketDAOProtocolSettingsMegapool", path: "megapool.stake.without.proof.enabled", value: { type: "bool", value: false } });
        await p.pdao.settings.deposits.setEnabled(false);
        await p.time.advance(12n * 3600n + 1n);
        const slot = await currentSlot(p);
        const proof = await pendingDepositProof(p, signedPendingDeposit(42n, WRONG_CREDENTIALS, 2_000_000_000n, slot));
        await (await submit(p, proof)).wait();
        assert.equal((await (await pool(p)).getValidatorInfo(0n)).dissolved, true);
    });

    it("rejects queued, staked and timeout-dissolved validators", async () => {
        const p = await load().ensure("current");
        await p.megapools.deposit("node"); // No remaining user funds, so validator 2 stays queued.
        let proof = await pendingDepositProof(p, signedPendingDeposit());
        await expectRevert(() => submit(p, proof, "node2", 2n), "Validator not prestaked");
        await p.time.advance(12n * 3600n + 1n);
        const mp = await pool(p);
        await (await mp.stakeWithoutProof(0n)).wait();
        proof = await pendingDepositProof(p, signedPendingDeposit());
        await expectRevert(() => submit(p, proof), "Validator not prestaked");
        await p.time.advance(await p.pdao.settings.megapools.getTimeBeforeDissolve() + 1n);
        await (await mp.dissolveValidator(1n)).wait();
        proof = await pendingDepositProof(p, signedPendingDeposit(43n));
        await expectRevert(() => submit(p, proof, "node2", 1n), "Validator not prestaked");
    });

    for (const bytecode of ["0x60006000fd", "0x60006000f3"]) {
        it(`propagates BLS verifier execution failure ${bytecode} without settling`, async () => {
            const p = await load().ensure("current");
            const proof = await pendingDepositProof(p, signedPendingDeposit());
            const before = await state(p);
            const address = await p.contracts.blsDepositVerifier.getAddress();
            const original = await ethers.provider.getCode(address);
            try {
                await network.provider.send("hardhat_setCode", [address, bytecode]);
                await expectRevert(() => submit(p, proof));
            } finally { await network.provider.send("hardhat_setCode", [address, original]); }
            assert.deepEqual(await state(p), before);
        });
    }
});

