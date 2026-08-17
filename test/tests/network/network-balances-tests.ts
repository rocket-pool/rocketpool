import { parseEther } from "ethers";

import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import { before, describe, expectRevert, it, load, ProtocolCurrent } from "../../harness";
import type { BalanceSubmission } from "../../harness/protocol/domains/network";
import { leaveODAOMemberAndAssert } from "../../scenarios/odao/leave-member";
import {
    executeBalancesScenario,
    submitBalancesScenario,
} from "../../scenarios/network/submit-balances";

const SLOT_TIMESTAMP = 1_600_000_000n;
const SUBMIT_FREQUENCY = 3_600n;

function balances(
    caller: string,
    block: bigint,
    totalEth = parseEther("10"),
    stakingEth = parseEther("9"),
    rethSupply = parseEther("8"),
): BalanceSubmission {
    return { caller, block, slotTimestamp: SLOT_TIMESTAMP, totalEth, stakingEth, rethSupply };
}

async function submitAll(current: ProtocolCurrent, submission: BalanceSubmission): Promise<void> {
    for (const caller of ["trustedNode1", "trustedNode2", "trustedNode3"]) {
        await submitBalancesScenario(current, { ...submission, caller });
    }
}

describe("RocketNetworkBalances", () => {
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
        await current.odao.settings.proposals.setCooldown(10n);
        await current.odao.settings.proposals.setVoteTime(10n);
        await current.odao.settings.proposals.setVoteDelay(4n);
        await current.pdao.settings.network.setSubmitBalancesFrequency(SUBMIT_FREQUENCY);
    });

    it("lets trusted nodes submit network balances", async () => {
        const current = await load().ensure("current");
        await submitBalancesScenario(current, balances(
            "trustedNode1", 1n, parseEther("10"), parseEther("9"), parseEther("7"),
        ));
        await submitBalancesScenario(current, balances(
            "trustedNode2", 1n, parseEther("10"), parseEther("9"), parseEther("6"),
        ));
        await submitBalancesScenario(current, balances(
            "trustedNode3", 1n, parseEther("10"), parseEther("9"), parseEther("5"),
        ));
        await submitBalancesScenario(current, balances("trustedNode1", 2n));
        await submitBalancesScenario(current, balances("trustedNode2", 2n));
    });

    it("rejects submissions while balance submissions are disabled", async () => {
        const current = await load().ensure("current");
        await current.pdao.settings.network.setSubmitBalancesEnabled(false);
        await expectRevert(
            () => current.network.balances.submit(balances("trustedNode1", 1n)),
            "Submitting balances is currently disabled",
        );
    });

    it("rejects network balances for a future block", async () => {
        const current = await load().ensure("current");
        const futureBlock = BigInt(await ethers.provider.getBlockNumber()) + 1n;
        await expectRevert(
            () => current.network.balances.submit(balances("trustedNode1", futureBlock)),
            "Balances can not be submitted for a future block",
        );
    });

    it("rejects network balances for a lower block than recorded", async () => {
        const current = await load().ensure("current");
        await submitBalancesScenario(current, balances("trustedNode1", 2n));
        await submitBalancesScenario(current, balances("trustedNode2", 2n));
        await expectRevert(
            () => current.network.balances.submit(balances("trustedNode3", 1n)),
            "Network balances for a higher block are set",
        );
    });

    it("accepts a vote for the currently recorded balance block", async () => {
        const current = await load().ensure("current");
        await submitBalancesScenario(current, balances("trustedNode1", 2n));
        await submitBalancesScenario(current, balances("trustedNode2", 2n));
        await submitBalancesScenario(current, balances("trustedNode3", 2n));
    });

    it("rejects balance consensus until 95% of the submission frequency has passed", async () => {
        const current = await load().ensure("current");
        await submitAll(current, balances("trustedNode1", 2n));
        await current.time.advance(1n);

        const next = balances(
            "trustedNode1",
            3n,
            parseEther("10.1"),
            parseEther("9.1"),
            parseEther("8.1"),
        );
        await submitBalancesScenario(current, next);
        await expectRevert(
            () => current.network.balances.submit({ ...next, caller: "trustedNode2" }),
            "Not enough time has passed",
        );

        await current.time.advance(SUBMIT_FREQUENCY);
        await submitBalancesScenario(current, { ...next, caller: "trustedNode2" });
        await submitBalancesScenario(current, { ...next, caller: "trustedNode3" });
    });

    it("rejects a network balance change that exceeds 2%", async () => {
        const current = await load().ensure("current");
        await submitAll(current, balances(
            "trustedNode1", 2n, parseEther("10"), parseEther("9"), parseEther("10"),
        ));
        await current.time.advance(SUBMIT_FREQUENCY);

        const increase = balances(
            "trustedNode1", 3n, parseEther("10.21"), parseEther("9.1"), parseEther("10"),
        );
        await submitBalancesScenario(current, increase);
        await expectRevert(
            () => current.network.balances.submit({ ...increase, caller: "trustedNode2" }),
            "Change exceeds maximum",
        );

        const decrease = balances(
            "trustedNode1", 3n, parseEther("7.9"), parseEther("6.1"), parseEther("10"),
        );
        await submitBalancesScenario(current, decrease);
        await expectRevert(
            () => current.network.balances.submit({ ...decrease, caller: "trustedNode2" }),
            "Change exceeds maximum",
        );

        await submitAll(current, balances(
            "trustedNode1", 3n, parseEther("10.2"), parseEther("9"), parseEther("10"),
        ));
    });

    it("rejects duplicate balance submissions", async () => {
        const current = await load().ensure("current");
        const submission = balances("trustedNode1", 1n);
        await submitBalancesScenario(current, submission);
        await expectRevert(
            () => current.network.balances.submit(submission),
            "Duplicate submission from node",
        );
    });

    it("rejects balance submissions from regular nodes", async () => {
        const current = await load().ensure("current");
        await expectRevert(
            () => current.network.balances.submit(balances("node", 1n)),
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
            const submission = balances("trustedNode1", 1n);
            await submitBalancesScenario(current, submission);
            await submitBalancesScenario(current, { ...submission, caller: "trustedNode2" });
            await leaveODAOMemberAndAssert(current, {
                member: "trustedNode4",
                voters: ["trustedNode1", "trustedNode2", "trustedNode3"],
            });
            await executeBalancesScenario(current, { ...submission, caller: "random" });
        });

        it("rejects execution without consensus", async () => {
            const current = await load().ensure("current");
            const submission = balances("trustedNode1", 1n);
            await submitBalancesScenario(current, submission);
            await submitBalancesScenario(current, { ...submission, caller: "trustedNode2" });
            await expectRevert(
                () => current.network.balances.execute({ ...submission, caller: "random" }),
                "Consensus has not been reached",
            );
        });
    });
});
