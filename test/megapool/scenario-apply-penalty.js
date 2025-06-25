import { RocketDAONodeTrusted, RocketMegapoolPenalties } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

const hre = require('hardhat');
const ethers = hre.ethers;

// Vote to apply a penalty to a megapool
export async function votePenalty(megapool, slot, amount, trustedNode) {

    const rocketMegapoolPenalties = await RocketMegapoolPenalties.deployed();
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();

    let trustedNodeCount = await rocketDAONodeTrusted.getMemberCount();

    async function getBalances() {
        let [voteCount, nodeDebt, currentMaxPenalty, currentPenaltyRunningTotal] = await Promise.all([
            rocketMegapoolPenalties.getVoteCount(megapool.target, slot, amount),
            megapool.getDebt(),
            rocketMegapoolPenalties.getCurrentMaxPenalty(),
            rocketMegapoolPenalties.getCurrentPenaltyRunningTotal(),
        ]);
        return { voteCount, nodeDebt, currentMaxPenalty, currentPenaltyRunningTotal };
    }

    const balancesBefore = await getBalances();
    await rocketMegapoolPenalties.connect(trustedNode).penalise(megapool.target, slot, amount);
    const balancesAfter = await getBalances();

    const balanceDeltas = {
        voteCount: balancesAfter.voteCount - balancesBefore.voteCount,
        nodeDebt: balancesAfter.nodeDebt - balancesBefore.nodeDebt,
        currentMaxPenalty: balancesAfter.currentMaxPenalty - balancesBefore.currentMaxPenalty,
        currentPenaltyRunningTotal: balancesAfter.currentPenaltyRunningTotal - balancesBefore.currentPenaltyRunningTotal,
    };

    let expectedPenalty = 0n;
    if (balancesAfter.voteCount > trustedNodeCount / 2n) {
        expectedPenalty = amount;

        if (expectedPenalty > balancesBefore.currentMaxPenalty) {
            expectedPenalty = balancesBefore.currentMaxPenalty;
        }
    }

    assertBN.equal(balanceDeltas.nodeDebt, expectedPenalty);                    // Debt should increase by expected penalty
    assertBN.equal(balanceDeltas.voteCount, 1n);                                // Vote count should increment
    assertBN.equal(balanceDeltas.currentMaxPenalty, -expectedPenalty);          // Max penalty should reduce by penalty
    assertBN.equal(balanceDeltas.currentPenaltyRunningTotal, expectedPenalty);  // Running total should increase by penalty
}
