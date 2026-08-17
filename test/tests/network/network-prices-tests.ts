import { parseEther } from "ethers";

import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import { before, describe, expectRevert, it, load } from "../../harness";
import { leaveODAOMemberAndAssert } from "../../scenarios/odao/leave-member";
import {
    executePricesScenario,
    submitPricesScenario,
} from "../../scenarios/network/submit-prices";

const SLOT_TIMESTAMP = 1_600_000_000n;
const PROPOSAL_COOLDOWN = 60n * 60n;
const PROPOSAL_VOTE_TIME = 60n * 60n;

function priceSubmission(caller: string, block: bigint, rplPrice = parseEther("0.02")) {
    return { caller, block, slotTimestamp: SLOT_TIMESTAMP, rplPrice };
}

describe("RocketNetworkPrices", () => {
    before(async () => {
        const current = await load().ensure("current");
        await current.nodes.register("node");
        for (const [name, id] of [
            ["trustedNode1", "saas_1"],
            ["trustedNode2", "saas_2"],
            ["trustedNode3", "saas_3"],
        ] as const) {
            await current.nodes.register(name);
            await current.odao.members.bootstrap(name, { id, url: "node@home.com" });
        }
        await current.odao.settings.proposals.setCooldown(PROPOSAL_COOLDOWN);
        await current.odao.settings.proposals.setVoteTime(PROPOSAL_VOTE_TIME);
        await current.odao.settings.proposals.setVoteDelay(4n);
    });

    it("lets trusted nodes submit network prices", async () => {
        const current = await load().ensure("current");
        let block = BigInt(await ethers.provider.getBlockNumber());
        await submitPricesScenario(current, priceSubmission("trustedNode1", block, parseEther("0.03")));
        await submitPricesScenario(current, priceSubmission("trustedNode2", block, parseEther("0.04")));
        await submitPricesScenario(current, priceSubmission("trustedNode3", block, parseEther("0.05")));

        block = BigInt(await ethers.provider.getBlockNumber());
        await submitPricesScenario(current, priceSubmission("trustedNode1", block));
        await submitPricesScenario(current, priceSubmission("trustedNode2", block));
    });

    it("rejects submissions while price submissions are disabled", async () => {
        const current = await load().ensure("current");
        await current.pdao.settings.network.setSubmitPricesEnabled(false);
        const block = BigInt(await ethers.provider.getBlockNumber());
        await expectRevert(
            () => current.network.prices.submit(priceSubmission("trustedNode1", block)),
            "Submitting prices is currently disabled",
        );
    });

    it("rejects network prices for a future block", async () => {
        const current = await load().ensure("current");
        const block = BigInt(await ethers.provider.getBlockNumber()) + 1n;
        await expectRevert(
            () => current.network.prices.submit(priceSubmission("trustedNode1", block)),
            "Prices can not be submitted for a future block",
        );
    });

    it("rejects network prices for a lower block than recorded", async () => {
        const current = await load().ensure("current");
        const block = BigInt(await ethers.provider.getBlockNumber());
        await submitPricesScenario(current, priceSubmission("trustedNode1", block));
        await submitPricesScenario(current, priceSubmission("trustedNode2", block));
        await expectRevert(
            () => current.network.prices.submit(priceSubmission("trustedNode3", block - 1n)),
            "Network prices for a higher block are set",
        );
    });

    it("accepts a vote for the currently recorded price block", async () => {
        const current = await load().ensure("current");
        const block = BigInt(await ethers.provider.getBlockNumber());
        await submitPricesScenario(current, priceSubmission("trustedNode1", block));
        await submitPricesScenario(current, priceSubmission("trustedNode2", block));
        await submitPricesScenario(current, priceSubmission("trustedNode3", block));
    });

    it("rejects duplicate price submissions", async () => {
        const current = await load().ensure("current");
        const submission = priceSubmission("trustedNode1", BigInt(await ethers.provider.getBlockNumber()));
        await submitPricesScenario(current, submission);
        await expectRevert(() => current.network.prices.submit(submission), "Duplicate submission from node");
    });

    it("rejects price submissions from regular nodes", async () => {
        const current = await load().ensure("current");
        const block = BigInt(await ethers.provider.getBlockNumber());
        await expectRevert(
            () => current.network.prices.submit(priceSubmission("node", block)),
            "Invalid trusted node",
        );
    });

    describe("with four trusted members", () => {
        before(async () => {
            const current = await load().ensure("current");
            await current.nodes.register("trustedNode4");
            await current.odao.members.bootstrap("trustedNode4", {
                id: "saas_4",
                url: "node@home.com",
            });
        });

        it("executes an update that reaches consensus after a member leaves", async () => {
            const current = await load().ensure("current");
            const block = BigInt(await ethers.provider.getBlockNumber());
            const submission = priceSubmission("trustedNode1", block);
            await submitPricesScenario(current, submission);
            await submitPricesScenario(current, { ...submission, caller: "trustedNode2" });
            await leaveODAOMemberAndAssert(current, {
                member: "trustedNode4",
                voters: ["trustedNode1", "trustedNode2", "trustedNode3"],
            });
            await executePricesScenario(current, { ...submission, caller: "random" });
        });

        it("rejects execution without consensus", async () => {
            const current = await load().ensure("current");
            const block = BigInt(await ethers.provider.getBlockNumber());
            const submission = priceSubmission("trustedNode1", block);
            await submitPricesScenario(current, submission);
            await submitPricesScenario(current, { ...submission, caller: "trustedNode2" });
            await expectRevert(
                () => current.network.prices.execute({ ...submission, caller: "random" }),
                "Consensus has not been reached",
            );
        });
    });
});
