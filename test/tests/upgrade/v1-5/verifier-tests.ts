import assert from "node:assert/strict";
import { id, Interface, parseEther, solidityPackedKeccak256 } from "ethers";
import pako from "pako";
import { before, describe, expectRevert, it, load, asNetworkContract } from "../../../harness";
import type { ProtocolCurrent, ProtocolV141 } from "../../../harness";
import { ethers } from "../../../../test-old/_utils/hardhat-runtime";
import { beaconProofs } from "../../../scenarios/network/participation-proofs";
import { currentEpoch, FAR_FUTURE_EPOCH, validatorProof } from "../../../scenarios/megapool/proofs";
import { validatorProofArgs } from "../../../scenarios/megapool/proof-encoding";
import { finalBalanceBeaconProof } from "../../../scenarios/megapool/beacon-final-balance";

async function provenValidator(protocol: ProtocolCurrent | ProtocolV141, validatorId: bigint, withdrawableEpoch = FAR_FUTURE_EPOCH) {
    const validator = await validatorProof(protocol, "node", validatorId, { withdrawableEpoch });
    return beaconProofs(protocol, { validator, validatorIndex: validatorId, participationEpoch: await currentEpoch(protocol) - 2n });
}

async function notify(protocol: ProtocolCurrent | ProtocolV141, validatorId: bigint, epoch: bigint) {
    const proof = await provenValidator(protocol, validatorId, epoch);
    await (await protocol.contracts.rocketMegapoolManager.connect(await protocol.context.actor("submitter")).notifyExit(
        ...validatorProofArgs(await protocol.megapools.address("node"), validatorId, proof.timestamp, proof.validatorProof, proof.slotProof),
    )).wait();
}

describe("v1.4.1 verifier upgrade to v1.5", () => {
    before(async () => {
        const old = await load().ensure("1.4");
        await old.nodes.register("node");
        await old.depositPool.fund("depositor", parseEther("84"));
        for (let i = 0; i < 3; i++) await old.megapools.deposit("node");
        const rp141 = await old.upgradeTo("1.4.1");
        for (let i = 0n; i < 3n; i++) {
            const proof = await provenValidator(rp141, i);
            await (await rp141.contracts.rocketMegapoolManager.connect(await rp141.context.actor("submitter")).stake(
                ...validatorProofArgs(await rp141.megapools.address("node"), i, proof.timestamp, proof.validatorProof, proof.slotProof),
            )).wait();
        }
        await notify(rp141, 0n, await currentEpoch(rp141) + 114n);
    });

    it("preserves state, journals the actual intermediate upgrade, and replaces registry ABIs", async () => {
        const old = await load().ensure("1.4.1");
        assert.equal(await old.contracts.beaconStateVerifier.version(), 2n);
        assert.equal(await old.contracts.rocketMegapoolManager.version(), 2n);
        const pool = await old.megapools.delegate("node");
        const validators = await Promise.all([0, 1, 2].map(async i => Array.from(await pool.getValidatorInfo(i))));
        const balances = [await pool.getNodeBond(), await pool.getUserCapital(), await ethers.provider.getBalance(await pool.getAddress())];
        const oldManager = await old.contracts.rocketMegapoolManager.getAddress();
        const current = await old.upgradeTo("current");
        await assert.rejects(old.megapools.validator("node", 0n), /Stale/);
        const activePool = await current.megapools.delegate("node");
        assert.deepEqual(await Promise.all([0, 1, 2].map(async i => Array.from(await activePool.getValidatorInfo(i)))), validators);
        assert.deepEqual([await activePool.getNodeBond(), await activePool.getUserCapital(), await ethers.provider.getBalance(await activePool.getAddress())], balances);
        assert.equal(await current.contracts.rocketMegapoolManager.version(), 3n);
        assert.equal(await current.contracts.rocketStorage.getString(id("protocol.version")), "1.5");
        assert.equal(await load().historical.get("1.4.1", "rocketMegapoolManager").getAddress(), oldManager);
        assert.equal(await current.contracts.rocketStorage.getBool(solidityPackedKeccak256(["string", "address"], ["contract.exists", oldManager])), false);
        for (const name of ["beaconStateVerifier", "rocketMegapoolManager"] as const) {
            const encoded = await current.contracts.rocketStorage.getString(solidityPackedKeccak256(["string", "string"], ["contract.abi", name]));
            const abi = JSON.parse(pako.inflate(Buffer.from(encoded, "base64"), { to: "string" }));
            assert.equal(new Interface(abi).formatJson(), current.contracts[name].interface.formatJson());
            assert.notEqual(await current.contracts[name].getAddress(), await load().historical.get("1.4.1", name).getAddress());
        }
        assert.equal(await current.contracts.rocketNetworkExit.getRequestedEth(), 0n);
        assert.equal(await current.contracts.rocketNetworkExit.getVoluntaryEth(), 0n);
    });

    it("settles pre-upgrade, requested and voluntary exits exactly once using verified V2 bundles", async () => {
        const old = await load().ensure("1.4.1");
        const current = await old.upgradeTo("current");
        const address = await current.megapools.address("node");
        const networkExit = current.contracts.rocketNetworkExit;
        await asNetworkContract(current, "rocketNetworkRedemptions", async signer => {
            await (await networkExit.connect(signer).requestMegapoolExit(address, 1n)).wait();
        });
        const epoch = await currentEpoch(current) + 114n;
        await notify(current, 1n, epoch);
        await notify(current, 2n, epoch);
        assert.equal(await networkExit.getRequestedEth(), parseEther("28"));
        assert.equal(await networkExit.getVoluntaryEth(), parseEther("28"));
        await current.time.advance(115n * 32n * 12n);
        const funder = await current.context.actor("withdrawalFunder");
        for (const index of [0n, 1n, 2n]) {
            await (await funder.sendTransaction({ to: address, value: parseEther("32") })).wait();
            const proof = await finalBalanceBeaconProof(current, index, parseEther("32"), epoch);
            const manager = current.contracts.rocketMegapoolManager.connect(await current.context.actor("node"));
            await (await manager.notifyFinalBalance(address, index, proof.timestamp, 2n, proof.proofData)).wait();
            await expectRevert(() => manager.notifyFinalBalance(address, index, proof.timestamp, 2n, proof.proofData), "Already exited");
            assert.equal(await networkExit.getRequestedEth(), index === 0n ? parseEther("28") : 0n);
            assert.equal(await networkExit.getVoluntaryEth(), index === 2n ? 0n : parseEther("28"));
        }
        assert.equal(await networkExit.getMegapoolOutstandingExitCount(address), 0n);
    });
});
