import assert from "assert";
import { encodeBytes32String, parseEther, solidityPackedKeccak256 } from "ethers";

import { before, describe, it, load, withImpersonatedSigner } from "../harness";
import { RocketStorage__factory } from "../harness/bindings/v1_3_1";
import type { ProtocolContext } from "../harness/context";
import { getActiveAddress } from "../harness/deployment";
import { checkProtocolInvariants } from "../harness/invariants";
import { network } from "../../test-old/_utils/hardhat-runtime";

const BOND = parseEther("8");
const NODE_BALANCE_KEY = encodeBytes32String("deposit.pool.node.balance");

async function withCorruptedUint(
    context: ProtocolContext,
    callerContract: string,
    key: string,
    value: bigint,
    callback: () => Promise<void>,
): Promise<void> {
    const snapshot = await network.provider.send("evm_snapshot");
    const caller = getActiveAddress(context.deployment, callerContract);
    try {
        await withImpersonatedSigner(caller, async signer => {
            const storage = RocketStorage__factory.connect(
                context.deployment.rocketStorageAddress,
                signer,
            );
            await (await storage.setUint(key, value)).wait();
            await callback();
        });
    } finally {
        const restored = await network.provider.send("evm_revert", [snapshot]);
        assert.equal(restored, true, "Unable to restore invariant test snapshot");
    }
}

async function assertMegapoolInvariantFailure(
    context: ProtocolContext,
    release: "1.4" | "current",
): Promise<void> {
    await withCorruptedUint(
        context,
        "rocketDepositPool",
        NODE_BALANCE_KEY,
        1n,
        async () => {
            await assert.rejects(
                () => checkProtocolInvariants(context),
                new RegExp(
                    `Protocol invariant failed \\[${release.replace(".", "\\.")}\\]: `
                    + "deposit pool node balance; expected 0, got 1",
                ),
            );
        },
    );
}

describe("protocol invariants", () => {
    before(async () => {
        const rp131 = await load().ensure("1.3.1");
        await rp131.nodes.register("node");
        await rp131.nodes.stakeMinimumRpl("node", {
            minipools: 1,
            bond: BOND,
        });
        await rp131.depositPool.fund("depositor", parseEther("24"));
        await rp131.minipools.create("pool", {
            node: "node",
            bond: BOND,
        });
        await rp131.time.advanceMinipoolScrubPeriod();
        await rp131.minipools.stake("pool");
    });

    it("accepts valid historical minipool accounting", async () => {
        await checkProtocolInvariants(load());
    });

    it("detects a corrupted historical minipool count", async () => {
        const context = load();
        const nodeAddress = await context.actorAddress("node");
        const countKey = solidityPackedKeccak256(
            ["string", "address", "uint256"],
            ["node.minipools.staking.count", nodeAddress, BOND],
        );

        await withCorruptedUint(
            context,
            "rocketMinipoolManager",
            countKey,
            0n,
            async () => {
                await assert.rejects(
                    () => checkProtocolInvariants(context),
                    /staking minipool count for node .*; expected 1, got 0/,
                );
            },
        );
    });

    it("does not apply megapool accounting before v1.4", async () => {
        const context = load();
        await withCorruptedUint(
            context,
            "rocketDepositPool",
            NODE_BALANCE_KEY,
            1n,
            () => checkProtocolInvariants(context),
        );
    });

    describe("v1.4", () => {
        before(async () => {
            const rp131 = await load().ensure("1.3.1");
            await rp131.upgradeTo("1.4");
        });

        it("detects a corrupted megapool node balance", async () => {
            await assertMegapoolInvariantFailure(load(), "1.4");
        });

        describe("current", () => {
            before(async () => {
                const rp14 = await load().ensure("1.4");
                await rp14.upgradeTo("current");
            });

            it("retains the megapool invariant after upgrading", async () => {
                await assertMegapoolInvariantFailure(load(), "current");
            });
        });
    });
});
