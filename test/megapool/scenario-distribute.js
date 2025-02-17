import { RocketStorage, RocketTokenRETH, RocketVault, RocketVoterRewards } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

const hre = require('hardhat');
const ethers = hre.ethers;

// Distribute a megapool
export async function distributeMegapool(megapool) {

    const rocketStorage = await RocketStorage.deployed();
    const rocketVoterRewards = await RocketVoterRewards.deployed();
    const rocketTokenRETH = await RocketTokenRETH.deployed();
    const rocketVault = await RocketVault.deployed();

    const nodeAddress = await megapool.getNodeAddress();
    const withdrawalAddress = await rocketStorage.getNodeWithdrawalAddress(nodeAddress);

    async function getBalances() {
        let [pendingRewards, megapoolBalance, nodeBalance, voterBalance, rethBalance, nodeDebt] = await Promise.all([
            megapool.getPendingRewards(),
            ethers.provider.getBalance(megapool.target),
            ethers.provider.getBalance(withdrawalAddress),
            rocketVault.balanceOf("rocketVoterRewards"),
            ethers.provider.getBalance(rocketTokenRETH.target),
            megapool.getDebt()
        ]);
        return { pendingRewards, megapoolBalance, nodeBalance, voterBalance, rethBalance, nodeDebt };
    }

    const [expectedNodeRewards, expectedVoterRewards, expectedRethRewards] = await megapool.calculatePendingRewards();

    const balancesBefore = await getBalances();
    await megapool.distribute();
    const balancesAfter = await getBalances();

    const balanceDeltas = {
        pendingRewards: balancesAfter.pendingRewards - balancesBefore.pendingRewards,
        megapoolBalance: balancesAfter.megapoolBalance - balancesBefore.megapoolBalance,
        nodeBalance: balancesAfter.nodeBalance - balancesBefore.nodeBalance,
        voterBalance: balancesAfter.voterBalance - balancesBefore.voterBalance,
        rethBalance: balancesAfter.rethBalance - balancesBefore.rethBalance,
        nodeDebt: balancesAfter.nodeDebt - balancesBefore.nodeDebt,
    }

    let expectedDebtDelta = 0n;

    if (balancesBefore.nodeDebt > 0n) {
        if (balancesBefore.nodeDebt > expectedNodeRewards) {
            expectedDebtDelta = -expectedNodeRewards;
        } else {
            expectedDebtDelta = -balancesBefore.nodeDebt;
        }
    }

    assertBN.equal(balanceDeltas.nodeDebt, expectedDebtDelta);
    assertBN.equal(balanceDeltas.nodeBalance - balanceDeltas.nodeDebt, expectedNodeRewards);
    assertBN.equal(balanceDeltas.voterBalance, expectedVoterRewards);
    assertBN.equal(balanceDeltas.rethBalance + balanceDeltas.nodeDebt, expectedRethRewards);
    assertBN.equal(balancesAfter.pendingRewards, 0n);
}
