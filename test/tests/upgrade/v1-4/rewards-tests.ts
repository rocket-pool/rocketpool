import { parseEther } from "ethers";

import { before, describe, it, load } from "../../../harness";
import type { RewardRow } from "../../../scenarios/rewards/reward-tree";
import {
    claimV0RewardsAndAssert,
    claimV1RewardsAndAssert,
    submitV0RewardsAndAssert,
    submitV1RewardsAndAssert,
} from "../../../scenarios/rewards/legacy-rewards";

describe("Rocket Pool 1.4 legacy rewards upgrade", () => {
    let rewardsV0: RewardRow[];
    let rewardsV1: RewardRow[];

    before(async () => {
        const rp131 = await load().ensure("1.3.1");
        await rp131.nodes.register("node1");
        await rp131.nodes.register("node2");
        for (const [name, id] of [["trusted1", "rp_1"], ["trusted2", "rp_2"]] as const) {
            await rp131.nodes.register(name);
            await rp131.odao.members.bootstrap(name, { id, url: `${id}@rocketpool.net` });
        }
        const guardian = await rp131.context.guardian();
        await (await guardian.sendTransaction({
            to: await rp131.contracts.rocketSmoothingPool.getAddress(),
            value: parseEther("20"),
        })).wait();
        const addresses = [await rp131.nodes.address("node1"), await rp131.nodes.address("node2")];
        rewardsV0 = addresses.map((address, index) => ({
            address,
            network: 0,
            trustedNodeRpl: 0n,
            nodeRpl: 0n,
            nodeEth: parseEther(index === 0 ? "2" : "1"),
        }));
        for (const caller of ["trusted1", "trusted2"]) {
            await submitV0RewardsAndAssert(rp131, {
                index: 0n,
                rows: rewardsV0,
                caller,
                treasuryRpl: 0n,
                userEth: parseEther("1"),
            });
        }

        const rp14 = await rp131.upgradeTo("1.4");
        rewardsV1 = rewardsV0.map(row => ({ ...row, voterEth: 0n }));
        for (const caller of ["trusted1", "trusted2"]) {
            await submitV1RewardsAndAssert(rp14, {
                index: 1n,
                rows: rewardsV1,
                caller,
                treasuryRpl: 0n,
                treasuryEth: 0n,
                userEth: parseEther("2"),
            });
        }
    });

    it("claims v1 and then legacy v0 rewards after upgrade", async () => {
        const rp14 = await load().ensure("1.4");
        await claimV1RewardsAndAssert(rp14, { node: "node1", indices: [1n], rows: [rewardsV1] });
        await claimV0RewardsAndAssert(rp14, { node: "node1", indices: [0n], rows: [rewardsV0] });
    });
});
