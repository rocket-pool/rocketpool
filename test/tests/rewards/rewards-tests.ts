import assert from "assert";
import { parseEther } from "ethers";

import {
    before,
    describe,
    expectRevert,
    it,
    load,
    type ProtocolCurrent,
    type RewardSubmission,
} from "../../harness";
import { kickODAOMemberAndAssert } from "../../scenarios/odao/kick-member";
import {
    claimAndStakeRewardsAndAssert,
    claimRewardsAndAssert,
    rewardClaims,
} from "../../scenarios/rewards/claims";
import {
    configureRewardsAndAssert,
    setRewardClaimersAndAssert,
    setRewardClaimIntervalAndAssert,
} from "../../scenarios/rewards/configuration";
import type { RewardRow } from "../../scenarios/rewards/reward-tree";
import {
    executeRewardsAndAssert,
    submitRewardsAndAssert,
} from "../../scenarios/rewards/snapshots";

const ONE_DAY = 24n * 60n * 60n;
const CLAIM_INTERVAL = 28n * ONE_DAY;
const HALF = parseEther("0.5");

type RewardAmounts = Omit<RewardRow, "address" | "network"> & { network?: number };

async function rewardRows(
    protocol: ProtocolCurrent,
    definitions: ReadonlyArray<readonly [string, RewardAmounts]>,
): Promise<RewardRow[]> {
    return Promise.all(definitions.map(async ([actor, amounts]) => ({
        address: await protocol.nodes.address(actor),
        network: amounts.network ?? 0,
        trustedNodeRpl: amounts.trustedNodeRpl,
        nodeRpl: amounts.nodeRpl,
        nodeEth: amounts.nodeEth,
        voterEth: amounts.voterEth ?? 0n,
    })));
}

async function submitConsensus(
    protocol: ProtocolCurrent,
    index: bigint,
    rows: RewardRow[],
    amounts: { treasuryRpl?: bigint; treasuryEth?: bigint; userEth?: bigint } = {},
): Promise<RewardSubmission> {
    let submission: RewardSubmission | undefined;
    for (const caller of ["trusted1", "trusted2"]) {
        submission = await submitRewardsAndAssert(protocol, {
            index,
            rows,
            caller,
            ...amounts,
        });
    }
    if (!submission) throw new Error("Reward snapshot was not constructed");
    return submission;
}

describe("RocketRewardsPool", () => {
    before(async () => {
        const rp131 = await load().ensure("1.3.1");
        const current = await rp131.upgradeTo("current");
        for (const node of [
            "node1",
            "node2",
            "trusted1",
            "trusted2",
            "futureTrusted1",
            "futureTrusted2",
        ]) {
            await current.nodes.register(node);
        }
        await current.nodes.setWithdrawalAddress("node1", "node1Withdrawal", {
            confirm: true,
        });
        for (const [member, id] of [
            ["trusted1", "saas_1"],
            ["trusted2", "saas_2"],
        ] as const) {
            await current.odao.members.bootstrap(member, {
                id,
                url: "node@home.com",
            });
        }
    });

    it("rejects a claim-interval update from a non-guardian", async () => {
        const current = await load().ensure("current");
        await expectRevert(
            () => current.pdao.settings.rewards.setClaimInterval(2n * ONE_DAY, { caller: "user1" }),
            "Account is not a temporary guardian",
        );
    });

    it("lets the guardian update the claim interval", async () => {
        await setRewardClaimIntervalAndAssert(await load().ensure("current"), 2n * ONE_DAY);
    });

    it("rejects a claimer-percentage update from a non-guardian", async () => {
        const current = await load().ensure("current");
        await expectRevert(
            () => current.pdao.settings.rewards.setClaimers({
                trustedNode: parseEther("0.1"),
                protocol: parseEther("0.5"),
                node: parseEther("0.4"),
            }, { caller: "user1" }),
            "Account is not a temporary guardian",
        );
    });

    it("lets the guardian update claimer percentages", async () => {
        await setRewardClaimersAndAssert(await load().ensure("current"), {
            trustedNode: parseEther("0.1"),
            protocol: parseEther("0.1"),
            node: parseEther("0.8"),
        });
    });

    it("rejects claimer percentages totalling less than 100%", async () => {
        const current = await load().ensure("current");
        await expectRevert(
            () => current.pdao.settings.rewards.setClaimers({
                trustedNode: parseEther("0.1"),
                protocol: parseEther("0.1"),
                node: parseEther("0.1"),
            }),
            "Total does not equal 100%",
        );
    });

    it("rejects claimer percentages totalling more than 100%", async () => {
        const current = await load().ensure("current");
        await expectRevert(
            () => current.pdao.settings.rewards.setClaimers({
                trustedNode: parseEther("0.4"),
                protocol: parseEther("0.4"),
                node: parseEther("0.4"),
            }),
            "Total does not equal 100%",
        );
    });

    it("allocates smoothing-pool ETH and voter share to the pDAO", async () => {
        const current = await load().ensure("current");
        await current.rewards.fundSmoothingPool("funder", HALF);
        await current.rewards.depositVoterShare("funder", HALF);
        const rows = await rewardRows(current, [["node1", {
            trustedNodeRpl: 0n,
            nodeRpl: 0n,
            nodeEth: 0n,
        }]]);
        await submitConsensus(current, 0n, rows, { treasuryEth: parseEther("1") });
    });

    describe("with rewards configured", () => {
        before(async () => {
            const current = await load().ensure("current");
            const inflationStart = await current.time.latest() + ONE_DAY;
            await configureRewardsAndAssert(current, {
                inflationStart,
                yearlyInflationTarget: 0.05,
                claimInterval: CLAIM_INTERVAL,
                claimers: {
                    trustedNode: HALF,
                    protocol: 0n,
                    node: HALF,
                },
            });
            const target = inflationStart + ONE_DAY + CLAIM_INTERVAL;
            await current.time.advance(target - await current.time.latest());
        });

        it("claims RPL and ETH across consecutive reward periods", async () => {
            const current = await load().ensure("current");
            await current.rewards.fundSmoothingPool("funder", parseEther("20"));
            const rows = await rewardRows(current, [
                ["node1", { trustedNodeRpl: 0n, nodeRpl: parseEther("1"), nodeEth: 0n }],
                ["node2", { trustedNodeRpl: 0n, nodeRpl: parseEther("2"), nodeEth: parseEther("1") }],
                ["trusted1", { trustedNodeRpl: parseEther("1"), nodeRpl: parseEther("2"), nodeEth: 0n }],
                ["user1", { trustedNodeRpl: 0n, nodeRpl: parseEther("1.333"), nodeEth: parseEther("0.3") }],
            ]);
            await submitConsensus(current, 0n, rows, { userEth: parseEther("2") });
            for (const node of ["node1", "node2", "trusted1", "user1"]) {
                await claimRewardsAndAssert(current, { node, indices: [0n], rows: [rows] });
            }
            await submitConsensus(current, 1n, rows);
            for (const node of ["node1", "node2"]) {
                await claimRewardsAndAssert(current, { node, indices: [1n], rows: [rows] });
            }
        });

        it("allows a node withdrawal address to claim", async () => {
            const current = await load().ensure("current");
            const rows = await rewardRows(current, [["node1", {
                trustedNodeRpl: 0n,
                nodeRpl: parseEther("1"),
                nodeEth: 0n,
            }]]);
            await submitConsensus(current, 0n, rows);
            await claimRewardsAndAssert(current, {
                node: "node1",
                caller: "node1Withdrawal",
                indices: [0n],
                rows: [rows],
            });
        });

        it("routes voter ETH to the RPL withdrawal address", async () => {
            const current = await load().ensure("current");
            await current.rewards.fundSmoothingPool("funder", parseEther("20"));
            await current.nodes.setRplWithdrawalAddress("node1", "node1RplWithdrawal", {
                caller: "node1Withdrawal",
                confirm: true,
            });
            const rows = await rewardRows(current, [["node1", {
                trustedNodeRpl: 0n,
                nodeRpl: 0n,
                nodeEth: parseEther("1"),
                voterEth: parseEther("2"),
            }]]);
            await submitConsensus(current, 0n, rows);
            await claimRewardsAndAssert(current, {
                node: "node1",
                caller: "node1Withdrawal",
                indices: [0n],
                rows: [rows],
            });
        });

        it("rejects an invalid Merkle proof", async () => {
            const current = await load().ensure("current");
            const rows = await rewardRows(current, [["node1", {
                trustedNodeRpl: 0n,
                nodeRpl: parseEther("1"),
                nodeEth: 0n,
            }]]);
            await submitConsensus(current, 0n, rows);
            const claims = rewardClaims(await current.nodes.address("node1"), [0n], [rows]);
            await expectRevert(
                () => current.rewards.claim("node2", claims),
                "Invalid proof",
            );
        });

        it("rejects claiming the same interval twice", async () => {
            const current = await load().ensure("current");
            const rows = await rewardRows(current, [["node1", {
                trustedNodeRpl: 0n,
                nodeRpl: parseEther("1"),
                nodeEth: 0n,
            }]]);
            for (let index = 0n; index < 3n; index += 1n) {
                await submitConsensus(current, index, rows);
            }
            await claimRewardsAndAssert(current, {
                node: "node1",
                indices: [0n, 1n],
                rows: [rows, rows],
            });
            for (const indices of [[0n], [1n], [0n, 1n], [0n, 2n]]) {
                const claims = rewardClaims(await current.nodes.address("node1"), indices, indices.map(() => rows));
                await expectRevert(
                    () => current.rewards.claim("node1", claims),
                    "Already claimed",
                );
            }
        });

        it("claims multiple reward periods in a single transaction", async () => {
            const current = await load().ensure("current");
            const rows = await rewardRows(current, [
                ["node1", { trustedNodeRpl: 0n, nodeRpl: parseEther("1"), nodeEth: 0n }],
                ["node2", { trustedNodeRpl: 0n, nodeRpl: parseEther("2"), nodeEth: 0n }],
            ]);
            for (let index = 0n; index < 3n; index += 1n) {
                await submitConsensus(current, index, rows);
            }
            await claimRewardsAndAssert(current, { node: "node1", indices: [0n], rows: [rows] });
            await claimRewardsAndAssert(current, { node: "node1", indices: [1n, 2n], rows: [rows, rows] });
            await claimRewardsAndAssert(current, { node: "node2", indices: [0n, 1n, 2n], rows: [rows, rows, rows] });
        });

        it("claims RPL and stakes some or all of it", async () => {
            const current = await load().ensure("current");
            const rows = await rewardRows(current, [
                ["node1", { trustedNodeRpl: 0n, nodeRpl: parseEther("1"), nodeEth: 0n }],
                ["node2", { trustedNodeRpl: 0n, nodeRpl: parseEther("2"), nodeEth: 0n }],
            ]);
            await submitConsensus(current, 0n, rows);
            await claimAndStakeRewardsAndAssert(current, {
                node: "node1", indices: [0n], rows: [rows], stakeAmount: parseEther("1"),
            });
            await claimAndStakeRewardsAndAssert(current, {
                node: "node2", indices: [0n], rows: [rows], stakeAmount: parseEther("2"),
            });
            await submitConsensus(current, 1n, rows);
            await claimAndStakeRewardsAndAssert(current, {
                node: "node1", indices: [1n], rows: [rows], stakeAmount: HALF,
            });
            await claimAndStakeRewardsAndAssert(current, {
                node: "node2", indices: [1n], rows: [rows], stakeAmount: parseEther("1"),
            });
        });

        it("requires the RPL withdrawal address when claiming and staking", async () => {
            const current = await load().ensure("current");
            await current.nodes.setRplWithdrawalAddress("node1", "rplWithdrawal", {
                caller: "node1Withdrawal",
                confirm: true,
            });
            const rows = await rewardRows(current, [["node1", {
                trustedNodeRpl: 0n, nodeRpl: parseEther("1"), nodeEth: 0n,
            }]]);
            await submitConsensus(current, 0n, rows);
            const claims = rewardClaims(await current.nodes.address("node1"), [0n], [rows]);
            for (const caller of ["node1", "node1Withdrawal"]) {
                await expectRevert(
                    () => current.rewards.claimAndStake("node1", claims, parseEther("1"), { caller }),
                    "Can only claim and stake from RPL withdrawal address",
                );
            }
            await claimAndStakeRewardsAndAssert(current, {
                node: "node1",
                caller: "rplWithdrawal",
                indices: [0n],
                rows: [rows],
                stakeAmount: parseEther("1"),
            });
        });

        it("allows the primary withdrawal address to claim and stake when no RPL address is set", async () => {
            const current = await load().ensure("current");
            const rows = await rewardRows(current, [["node1", {
                trustedNodeRpl: 0n, nodeRpl: parseEther("1"), nodeEth: 0n,
            }]]);
            await submitConsensus(current, 0n, rows);
            await claimAndStakeRewardsAndAssert(current, {
                node: "node1",
                caller: "node1Withdrawal",
                indices: [0n],
                rows: [rows],
                stakeAmount: parseEther("1"),
            });
        });

        it("rejects staking more RPL than was claimed", async () => {
            const current = await load().ensure("current");
            const rows = await rewardRows(current, [["node1", {
                trustedNodeRpl: 0n, nodeRpl: parseEther("1"), nodeEth: 0n,
            }]]);
            await submitConsensus(current, 0n, rows);
            const claims = rewardClaims(await current.nodes.address("node1"), [0n], [rows]);
            await expectRevert(
                () => current.rewards.claimAndStake("node1", claims, parseEther("2")),
                "Invalid stake amount",
            );
        });

        it("claims and stakes RPL from multiple snapshots", async () => {
            const current = await load().ensure("current");
            const rows = await rewardRows(current, [["node1", {
                trustedNodeRpl: 0n, nodeRpl: parseEther("1"), nodeEth: 0n,
            }]]);
            await submitConsensus(current, 0n, rows);
            await submitConsensus(current, 1n, rows);
            await claimAndStakeRewardsAndAssert(current, {
                node: "node1",
                indices: [0n, 1n],
                rows: [rows, rows],
                stakeAmount: parseEther("2"),
            });
        });

        async function pendingSnapshotWithFourMembers(
            current: ProtocolCurrent,
        ): Promise<{ rows: RewardRow[]; submission: RewardSubmission }> {
            for (const [member, id] of [
                ["futureTrusted1", "saas_3"],
                ["futureTrusted2", "saas_4"],
            ] as const) {
                await current.odao.members.bootstrap(member, { id, url: "node@home.com" });
            }
            const rows = await rewardRows(current, [["node1", {
                trustedNodeRpl: 0n, nodeRpl: parseEther("1"), nodeEth: 0n,
            }]]);
            let submission: RewardSubmission | undefined;
            for (const caller of ["trusted1", "trusted2"]) {
                submission = await submitRewardsAndAssert(current, { index: 0n, rows, caller });
            }
            if (!submission) throw new Error("Pending reward submission was not constructed");
            await kickODAOMemberAndAssert(current, {
                member: "futureTrusted1",
                proposer: "trusted1",
                voters: ["trusted1", "trusted2", "futureTrusted1"],
            });
            return { rows, submission };
        }

        it("allows anyone to execute a reward period after consensus changes", async () => {
            const current = await load().ensure("current");
            const { submission } = await pendingSnapshotWithFourMembers(current);
            await executeRewardsAndAssert(current, submission, { caller: "random" });
        });

        it("rejects executing a reward period twice", async () => {
            const current = await load().ensure("current");
            const { submission } = await pendingSnapshotWithFourMembers(current);
            await executeRewardsAndAssert(current, submission, { caller: "random" });
            await expectRevert(() => current.rewards.execute(submission, { caller: "random" }));
        });

        it("accepts an additional matching submission after consensus", async () => {
            const current = await load().ensure("current");
            await current.odao.members.bootstrap("futureTrusted1", {
                id: "saas_3",
                url: "node@home.com",
            });
            const rows = await rewardRows(current, [["node1", {
                trustedNodeRpl: 0n, nodeRpl: parseEther("1"), nodeEth: 0n,
            }]]);
            await submitConsensus(current, 0n, rows);
            const indexAfterConsensus = await current.rewards.rewardIndex();
            await submitRewardsAndAssert(current, {
                index: 0n,
                rows,
                caller: "futureTrusted1",
            });
            assert.equal(await current.rewards.rewardIndex(), indexAfterConsensus);
        });

        it("stores the expected claim bitmap", async () => {
            const current = await load().ensure("current");
            const rows = await rewardRows(current, [["node1", {
                trustedNodeRpl: 0n, nodeRpl: parseEther("1"), nodeEth: 0n,
            }]]);
            for (let index = 0n; index < 10n; index += 1n) {
                await submitConsensus(current, index, rows);
            }
            const indices = [0n, 4n, 6n, 9n];
            await claimRewardsAndAssert(current, {
                node: "node1",
                indices,
                rows: indices.map(() => rows),
            });
            assert.equal(await current.rewards.claimedBitmap("node1", 0n), 1n | 16n | 64n | 512n);
            for (const index of indices) {
                const claims = rewardClaims(await current.nodes.address("node1"), [index], [rows]);
                await expectRevert(
                    () => current.rewards.claim("node1", claims),
                    "Already claimed",
                );
            }
        });

        it("recovers ETH after delivery to a withdrawal address fails", async () => {
            const ctx = load();
            const current = await ctx.ensure("current");
            const receiver = await ctx.fixtures.revertingReceiver.deploy("rewardReceiver");
            await receiver.setEnabled(true);
            await current.nodes.setWithdrawalAddress("node1", receiver.address, {
                caller: "node1Withdrawal",
                confirm: true,
            });
            await current.rewards.fundSmoothingPool("funder", parseEther("20"));
            const rows = await rewardRows(current, [["node1", {
                trustedNodeRpl: 0n, nodeRpl: 0n, nodeEth: parseEther("1"),
            }]]);
            await submitConsensus(current, 0n, rows, { userEth: parseEther("1") });
            await claimAndStakeRewardsAndAssert(current, {
                node: "node1",
                indices: [0n],
                rows: [rows],
                stakeAmount: 0n,
            });
            assert.equal(await current.rewards.outstandingEth(receiver.address), parseEther("1"));
            const balanceBefore = await receiver.balance();
            await receiver.setEnabled(false);
            await receiver.call(
                await current.contracts.rocketMerkleDistributorMainnet.getAddress(),
                current.contracts.rocketMerkleDistributorMainnet.interface
                    .encodeFunctionData("claimOutstandingEth"),
            );
            assert.equal(await current.rewards.outstandingEth(receiver.address), 0n);
            assert.equal(await receiver.balance() - balanceBefore, parseEther("1"));
        });
    });
});
