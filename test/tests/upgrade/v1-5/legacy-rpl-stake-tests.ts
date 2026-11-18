import assert from "node:assert/strict";
import { parseEther, solidityPackedKeccak256 } from "ethers";

import { asNetworkContract, before, describe, expectRevert, it, load } from "../../../harness";
import { rplStakingSnapshot, unstakeLegacyRplAndAssert, withdrawRplAndAssert } from "../../../scenarios/node/rpl-staking";

describe("v1.5 legacy RPL stake snapshot repair", () => {
    const amount = parseEther("1000");

    before(async () => {
        const old = await load().ensure("1.3.1");
        await old.nodes.register("node");
        await old.tokens.mintRpl("node", amount);
        await old.nodes.stakeRpl("node", amount);

        // Model a funded stake held entirely in the pre-snapshot storage format
        const node = await old.nodes.address("node");
        const key = solidityPackedKeccak256(["string", "address"], ["rpl.staked.node.amount", node]);
        const lengthKey = solidityPackedKeccak256(["string", "bytes32"], ["snapshot.length", key]);
        await asNetworkContract(old, "rocketNodeStaking", async signer => {
            const storage = old.contracts.rocketStorage.connect(signer);
            await (await storage.setUint(key, amount)).wait();
            await (await storage.setUint(lengthKey, 0n)).wait();
        });
        assert.equal(await old.contracts.rocketNodeStaking.getNodeRPLStake(node), amount);
        await old.upgradeTo("current");
    });

    it("lets only the guardian restore the balance once and the node withdraw it", async () => {
        const current = await load().ensure("current");
        const node = await current.nodes.address("node");
        const upgrade = current.contracts.rocketUpgradeOneDotFive.connect(await current.context.guardian());
        const outsider = upgrade.connect(await current.context.actor("random"));
        const before = await rplStakingSnapshot(current, "node");
        assert.equal(before.nodeTotal, 0n);
        await expectRevert(() => current.nodes.unstakeLegacyRpl("node", amount), "Insufficient legacy staked RPL");
        await expectRevert(() => outsider.restoreNodeRPLStakeSnapshot(node), "Account is not a temporary guardian");

        await (await upgrade.restoreNodeRPLStakeSnapshot(node)).wait();
        assert.deepEqual(await rplStakingSnapshot(current, "node"), { ...before, nodeLegacy: amount, nodeTotal: amount });
        await expectRevert(() => upgrade.restoreNodeRPLStakeSnapshot(node), "Stake snapshot already exists");

        await unstakeLegacyRplAndAssert(current, "node", amount);
        await current.time.advanceRplUnstakingPeriod();
        await withdrawRplAndAssert(current, "node");
        // The static value still exists after withdrawal, but the latest snapshot is now zero
        await expectRevert(() => upgrade.restoreNodeRPLStakeSnapshot(node), "Stake snapshot already exists");
    });

    it("rejects a registered node with no legacy stake", async () => {
        const current = await load().ensure("current");
        await current.nodes.register("emptyNode");
        const node = await current.nodes.address("emptyNode");
        const upgrade = current.contracts.rocketUpgradeOneDotFive.connect(await current.context.guardian());
        await expectRevert(() => upgrade.restoreNodeRPLStakeSnapshot(node), "No legacy RPL stake");
    });
});
