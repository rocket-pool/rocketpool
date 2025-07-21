import {
    RocketDepositPool,
    RocketMegapoolManager,
    RocketStorage,
    RocketTokenRETH,
    RocketVault,
    RocketVoterRewards,
} from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';
import { getValidatorInfo } from '../_helpers/megapool';
import assert from 'assert';

const hre = require('hardhat');
const ethers = hre.ethers;

// Notify megapool of exiting validator
export async function notifyExitValidator(megapool, validatorId, withdrawalEpoch) {

    const rocketMegapoolManager = await RocketMegapoolManager.deployed();

    async function getData() {
        let [activeValidatorCount, exitingValidatorCount, soonestWithdrawableEpoch] = await Promise.all([
            megapool.getActiveValidatorCount(),
            megapool.getExitingValidatorCount(),
            megapool.getSoonestWithdrawableEpoch(),
        ]);
        return { activeValidatorCount, exitingValidatorCount, soonestWithdrawableEpoch };
    }

    const withdrawalCredentials = await megapool.getWithdrawalCredentials();

    const infoBefore = await getValidatorInfo(megapool, validatorId)

    // Construct a fake proof
    const proof = {
        slot: 0,
        validatorIndex: infoBefore.validatorIndex,
        validator: {
            pubkey: '0x00',
            withdrawalCredentials: withdrawalCredentials,
            effectiveBalance: 0n,
            slashed: false,
            activationEligibilityEpoch: 0n,
            activationEpoch: 0n,
            exitEpoch: 0n,
            withdrawableEpoch: withdrawalEpoch,
        },
        witnesses: [],
    };

    const dataBefore = await getData();
    await rocketMegapoolManager.notifyExit(megapool.target, validatorId, proof);
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
export async function notifyFinalBalanceValidator(megapool, validatorId, finalBalance, funder, withdrawalSlot) {

    const rocketStorage = await RocketStorage.deployed();
    const rocketTokenRETH = await RocketTokenRETH.deployed();
    const rocketMegapoolManager = await RocketMegapoolManager.deployed();
    const rocketVault = await RocketVault.deployed();

    const nodeAddress = await megapool.getNodeAddress();
    const withdrawalAddress = await rocketStorage.getNodeWithdrawalAddress(nodeAddress);

    async function getBalances() {
        let [pendingRewards, megapoolBalance, nodeBalance, rethBalance, depositPoolBalance, nodeRefund, activeValidatorCount] = await Promise.all([
            megapool.getPendingRewards(),
            ethers.provider.getBalance(megapool.target),
            ethers.provider.getBalance(withdrawalAddress),
            ethers.provider.getBalance(rocketTokenRETH.target),
            rocketVault.balanceOf('rocketDepositPool'),
            megapool.getRefundValue(),
            megapool.getActiveValidatorCount()
        ]);
        return { pendingRewards, megapoolBalance, nodeBalance, rethBalance, depositPoolBalance, nodeRefund, activeValidatorCount };
    }

    const balancesBefore = await getBalances();

    // Mock exiting validator by sending final balance to megapool
    await funder.sendTransaction({
        to: megapool.target,
        value: finalBalance,
    });

    const withdrawalCredentials = Buffer.from(megapool.target.substr(2), 'hex');
    const amountInGwei = finalBalance / '1'.gwei;
    const infoBefore = await getValidatorInfo(megapool, validatorId);

    const proof = {
        slot: withdrawalSlot,
        withdrawalSlot: withdrawalSlot,
        withdrawalNum: 0n,
        withdrawal: {
            index: 0n,
            validatorIndex: infoBefore.validatorIndex,
            withdrawalCredentials: withdrawalCredentials,
            amountInGwei: amountInGwei,
        },
        witnesses: []
    }

    await rocketMegapoolManager.connect(megapool.runner).notifyFinalBalance(megapool.target, validatorId, proof);
    const balancesAfter = await getBalances();

    const balanceDeltas = {
        pendingRewards: balancesAfter.pendingRewards - balancesBefore.pendingRewards,
        megapoolBalance: balancesAfter.megapoolBalance - balancesBefore.megapoolBalance,
        nodeBalance: balancesAfter.nodeBalance - balancesBefore.nodeBalance,
        rethBalance: balancesAfter.rethBalance - balancesBefore.rethBalance,
        depositPoolBalance: balancesAfter.depositPoolBalance - balancesBefore.depositPoolBalance,
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
        assertBN.equal(balanceDeltas.depositPoolBalance + balanceDeltas.rethBalance + balanceDeltas.nodeBalance + balanceDeltas.nodeRefund, finalBalance);
    } else {
        assertBN.equal(balanceDeltas.depositPoolBalance + balanceDeltas.rethBalance + balanceDeltas.nodeRefund, finalBalance);
    }

    if (!info.dissolved) {
        assertBN.equal(balanceDeltas.activeValidatorCount, -1n);
    }
}
