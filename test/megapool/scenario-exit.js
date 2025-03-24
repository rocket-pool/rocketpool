import { RocketStorage, RocketTokenRETH, RocketVault, RocketVoterRewards } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';
import { getValidatorInfo } from '../_helpers/megapool';
import assert from 'assert';

const hre = require('hardhat');
const ethers = hre.ethers;

// Nofiy megapool of exiting validator
export async function notifyExitValidator(megapool, validatorId, withdrawalEpoch) {

    async function getData() {
        let [activeValidatorCount, exitingValidatorCount, soonestWithdrawableEpoch] = await Promise.all([
            megapool.getActiveValidatorCount(),
            megapool.getExitingValidatorCount(),
            megapool.getSoonestWithdrawableEpoch(),
        ]);
        return { activeValidatorCount, exitingValidatorCount, soonestWithdrawableEpoch };
    }

    const dataBefore = await getData();
    await megapool.notifyExit(validatorId, withdrawalEpoch, 0n, []);
    const dataAfter = await getData();

    const info = await getValidatorInfo(megapool, validatorId);

    const deltas = {
        activeValidatorCount: dataAfter.activeValidatorCount - dataBefore.activeValidatorCount,
        exitingValidatorCount: dataAfter.exitingValidatorCount - dataBefore.exitingValidatorCount,
    };

    assert.equal(info.exiting, true);
    assert.equal(info.exited, false);

    if (info.dissolved) {
        assertBN.equal(deltas.activeValidatorCount, 0n);
        assertBN.equal(deltas.exitingValidatorCount, 0n);
        assertBN.equal(dataBefore.soonestWithdrawableEpoch, dataAfter.soonestWithdrawableEpoch);
    } else {
        assertBN.equal(deltas.activeValidatorCount, 0n);
        assertBN.equal(deltas.exitingValidatorCount, 1n);

        let expectedSoonestWithdrawableEpoch = dataBefore.soonestWithdrawableEpoch;
        if (dataBefore.soonestWithdrawableEpoch === 0n || withdrawalEpoch < expectedSoonestWithdrawableEpoch) {
            expectedSoonestWithdrawableEpoch = withdrawalEpoch;
        }

        assertBN.equal(dataAfter.soonestWithdrawableEpoch, expectedSoonestWithdrawableEpoch);
    }
}

// Notify validator of final balance
export async function notifyFinalBalanceValidator(megapool, validatorId, finalBalance, funder) {

    const rocketStorage = await RocketStorage.deployed();
    const rocketTokenRETH = await RocketTokenRETH.deployed();

    const nodeAddress = await megapool.getNodeAddress();
    const withdrawalAddress = await rocketStorage.getNodeWithdrawalAddress(nodeAddress);

    async function getBalances() {
        let [pendingRewards, megapoolBalance, nodeBalance, rethBalance, nodeRefund, activeValidatorCount] = await Promise.all([
            megapool.getPendingRewards(),
            ethers.provider.getBalance(megapool.target),
            ethers.provider.getBalance(withdrawalAddress),
            ethers.provider.getBalance(rocketTokenRETH.target),
            megapool.getRefundValue(),
            megapool.getActiveValidatorCount()
        ]);
        return { pendingRewards, megapoolBalance, nodeBalance, rethBalance, nodeRefund, activeValidatorCount };
    }

    const balancesBefore = await getBalances();

    // Mock exiting validator by sending final balance to megapool
    await funder.sendTransaction({
        to: megapool.target,
        value: finalBalance,
    });

    const withdrawalCredentials = await megapool.getWithdrawalCredentials();
    const amountInGwei = finalBalance / '1'.gwei;
    await megapool.notifyFinalBalance(validatorId, 0n, 0n, [0n, 0n, withdrawalCredentials, amountInGwei], 0n, []);
    const balancesAfter = await getBalances();

    const balanceDeltas = {
        pendingRewards: balancesAfter.pendingRewards - balancesBefore.pendingRewards,
        megapoolBalance: balancesAfter.megapoolBalance - balancesBefore.megapoolBalance,
        nodeBalance: balancesAfter.nodeBalance - balancesBefore.nodeBalance,
        rethBalance: balancesAfter.rethBalance - balancesBefore.rethBalance,
        nodeRefund: balancesAfter.nodeRefund - balancesBefore.nodeRefund,
        activeValidatorCount: balancesAfter.activeValidatorCount - balancesBefore.activeValidatorCount,
    }

    const nodeCalling = (megapool.runner.address.toLowerCase() === nodeAddress.toLowerCase()) ||
        (megapool.runner.address.toLowerCase() === withdrawalAddress.toLowerCase());

    // Check state updates
    const info = await getValidatorInfo(megapool, validatorId);

    assert.equal(info.exiting, false);
    assert.equal(info.exited, true);
    assertBN.equal(info.exitBalance, finalBalance / '1'.gwei);

    // Pending rewards shouldn't change on capital distribution
    assertBN.equal(balanceDeltas.pendingRewards, 0);

    if (nodeCalling) {
        assertBN.equal(balanceDeltas.rethBalance + balanceDeltas.nodeBalance + balanceDeltas.nodeRefund, finalBalance);
    } else {
        console.log('Not node calling');
        assertBN.equal(balanceDeltas.rethBalance + balanceDeltas.nodeBalance + balanceDeltas.nodeRefund, finalBalance);
    }

    if (!info.dissolved) {
        assertBN.equal(balanceDeltas.activeValidatorCount, -1n);
    }
}
