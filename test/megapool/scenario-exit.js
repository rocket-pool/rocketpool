import {
    RocketMegapoolManager,
    RocketNodeDeposit,
    RocketStorage,
    RocketTokenRETH,
    RocketVault,
} from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';
import { getValidatorInfo } from '../_helpers/megapool';
import assert from 'assert';
import { getSlotForBlock, slotsPerEpoch } from '../_helpers/beaconchain';

const hre = require('hardhat');
const ethers = hre.ethers;
const helpers = require('@nomicfoundation/hardhat-network-helpers');

// Notify megapool of exiting validator
export async function notifyExitValidator(megapool, validatorId, withdrawalEpoch) {

    const rocketMegapoolManager = await RocketMegapoolManager.deployed();

    async function getData() {
        let [activeValidatorCount, exitingValidatorCount] = await Promise.all([
            megapool.getActiveValidatorCount(),
            megapool.getExitingValidatorCount(),
        ]);
        return { activeValidatorCount, exitingValidatorCount };
    }

    const withdrawalCredentials = await megapool.getWithdrawalCredentials();

    const infoBefore = await getValidatorInfo(megapool, validatorId);

    // Use current time as slot timestamp
    await helpers.mine();
    const latestBlock = await ethers.provider.getBlock('latest');
    const currentTime = latestBlock.timestamp;

    // Construct a fake proof
    const proof = {
        validatorIndex: 1n,
        validator: {
            pubkey: infoBefore.pubkey,
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
    const slotProof = {
        slot: await getSlotForBlock(),
        witnesses: [],
    };

    const dataBefore = await getData();
    await rocketMegapoolManager.notifyExit(megapool.target, validatorId, currentTime, proof, slotProof);
    const dataAfter = await getData();

    const info = await getValidatorInfo(megapool, validatorId);

    const deltas = {
        activeValidatorCount: dataAfter.activeValidatorCount - dataBefore.activeValidatorCount,
        exitingValidatorCount: dataAfter.exitingValidatorCount - dataBefore.exitingValidatorCount,
    };

    assert.equal(info.exiting, true);
    assert.equal(info.exited, false);

    assertBN.equal(deltas.activeValidatorCount, 0n);
    assertBN.equal(deltas.exitingValidatorCount, 1n);
}

// Notify validator of final balance
export async function notifyFinalBalanceValidator(megapool, validatorId, finalBalance, funder, withdrawalSlot, withdrawableEpoch = null) {

    const rocketStorage = await RocketStorage.deployed();
    const rocketTokenRETH = await RocketTokenRETH.deployed();
    const rocketMegapoolManager = await RocketMegapoolManager.deployed();
    const rocketVault = await RocketVault.deployed();
    const rocketNodeDeposit = await RocketNodeDeposit.deployed();

    const nodeAddress = await megapool.getNodeAddress();
    const withdrawalAddress = await rocketStorage.getNodeWithdrawalAddress(nodeAddress);

    async function getData() {
        let [pendingRewards, megapoolBalance, nodeBalance, rethBalance, depositPoolBalance, nodeRefund, activeValidatorCount, exitingValidatorCount, nodeBond, userCapital, nodeQueuedBond, userQueuedCapital] = await Promise.all([
            megapool.getPendingRewards(),
            ethers.provider.getBalance(megapool.target),
            ethers.provider.getBalance(withdrawalAddress),
            ethers.provider.getBalance(rocketTokenRETH.target),
            rocketVault.balanceOf('rocketDepositPool'),
            megapool.getRefundValue(),
            megapool.getActiveValidatorCount(),
            megapool.getExitingValidatorCount(),
            megapool.getNodeBond(),
            megapool.getUserCapital(),
            megapool.getNodeQueuedBond(),
            megapool.getUserQueuedCapital(),
        ]);
        return {
            pendingRewards,
            megapoolBalance,
            nodeBalance,
            rethBalance,
            depositPoolBalance,
            nodeRefund,
            activeValidatorCount,
            exitingValidatorCount,
            nodeBond,
            userCapital,
            nodeQueuedBond,
            userQueuedCapital,
        };
    }

    const data1 = await getData();

    // Mock exiting validator by sending final balance to megapool
    await funder.sendTransaction({
        to: megapool.target,
        value: finalBalance,
    });

    const executionWithdrawalCredentials = Buffer.from(megapool.target.substr(2), 'hex');
    const amountInGwei = finalBalance / '1'.gwei;
    const infoBefore = await getValidatorInfo(megapool, validatorId);

    const withdrawalCredentials = await megapool.getWithdrawalCredentials();

    // Use current time as slot timestamp
    await helpers.mine();
    const latestBlock = await ethers.provider.getBlock('latest');
    const currentTime = latestBlock.timestamp;

    const withdrawalProof = {
        withdrawalSlot: withdrawalSlot,
        withdrawalNum: 0n,
        withdrawal: {
            index: 0n,
            validatorIndex: 2n,
            withdrawalCredentials: executionWithdrawalCredentials,
            amountInGwei: amountInGwei,
        },
        witnesses: [],
    };
    const validatorProof = {
        validatorIndex: 2n,
        validator: {
            pubkey: infoBefore.pubkey,
            withdrawalCredentials: withdrawalCredentials,
            withdrawableEpoch: withdrawableEpoch ? withdrawableEpoch : withdrawalSlot / slotsPerEpoch,
            // Only above three need to be valid values
            effectiveBalance: 0n,
            slashed: false,
            activationEligibilityEpoch: 0n,
            activationEpoch: 0n,
            exitEpoch: 0n,
        },
        witnesses: [],
    };
    const slotProof = {
        slot: await getSlotForBlock(),
        witnesses: [],
    };

    await rocketMegapoolManager.connect(megapool.runner).notifyFinalBalance(megapool.target, validatorId, currentTime, withdrawalProof, validatorProof, slotProof);
    const data2 = await getData();

    // Get new bond requirements
    let bondRequirement = 0n;
    if (data2.activeValidatorCount > 0n) {
        bondRequirement = await rocketNodeDeposit.getBondRequirement(data2.activeValidatorCount);
    }

    let expectedNodeBondDelta = -(data1.nodeBond - bondRequirement);
    if (expectedNodeBondDelta < -'32'.ether) {
        expectedNodeBondDelta = -'32'.ether;
    }

    const deltas = {
        pendingRewards: data2.pendingRewards - data1.pendingRewards,
        megapoolBalance: data2.megapoolBalance - data1.megapoolBalance,
        nodeBalance: data2.nodeBalance - data1.nodeBalance,
        rethBalance: data2.rethBalance - data1.rethBalance,
        depositPoolBalance: data2.depositPoolBalance - data1.depositPoolBalance,
        nodeRefund: data2.nodeRefund - data1.nodeRefund,
        activeValidatorCount: data2.activeValidatorCount - data1.activeValidatorCount,
        nodeBond: data2.nodeBond - data1.nodeBond,
        userCapital: data2.userCapital - data1.userCapital,
        nodeQueuedBond: data2.nodeQueuedBond - data1.nodeQueuedBond,
        userQueuedCapital: data2.userQueuedCapital - data1.userQueuedCapital,
    };

    const nodeCalling = (megapool.runner.address.toLowerCase() === nodeAddress.toLowerCase()) ||
        (megapool.runner.address.toLowerCase() === withdrawalAddress.toLowerCase());

    // Check state updates
    const info = await getValidatorInfo(megapool, validatorId);

    assert.equal(info.exiting, false);
    assert.equal(info.exited, true);
    assertBN.equal(info.exitBalance, finalBalance / '1'.gwei);

    if (info.dissolved) {
        assertBN.equal(deltas.nodeBond, 0n);
        assertBN.equal(deltas.userCapital, 0n);
        assertBN.equal(deltas.nodeQueuedBond, 0n);
        assertBN.equal(deltas.userQueuedCapital, 0n);
    } else {
        assertBN.equal(deltas.nodeBond, expectedNodeBondDelta);
        assertBN.equal(deltas.userCapital, -'32'.ether - expectedNodeBondDelta);
        assertBN.equal(deltas.nodeQueuedBond, 0n);
        assertBN.equal(deltas.userQueuedCapital, 0n);
    }

    // Pending rewards shouldn't change on capital distribution
    assertBN.equal(deltas.pendingRewards, 0);

    if (nodeCalling) {
        assertBN.equal(deltas.depositPoolBalance + deltas.rethBalance + deltas.nodeBalance + deltas.nodeRefund, finalBalance);
    } else {
        assertBN.equal(deltas.depositPoolBalance + deltas.rethBalance + deltas.nodeRefund, finalBalance);
    }

    if (!info.dissolved) {
        assertBN.equal(deltas.activeValidatorCount, -1n);
    }
}
