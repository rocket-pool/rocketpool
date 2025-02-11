import { assertBN } from './bn';
import * as assert from 'assert';
import {
    artifacts, LinkedListStorage, RocketDAOProtocolSettingsDeposit, RocketDepositPool,
    RocketMegapoolDelegate,
    RocketMegapoolFactory, RocketMegapoolManager,
    RocketNodeDeposit, RocketNodeManager,
    RocketNodeStaking,
} from '../_utils/artifacts';
import { getDepositDataRoot, getValidatorPubkey, getValidatorSignature } from '../_utils/beacon';
import { shouldRevert } from '../_utils/testing';
const hre = require('hardhat');
const ethers = hre.ethers;

const milliToWei = 1000000000000000n;

export async function getValidatorInfo(megapool, index) {
    const validatorInfo = await megapool.getValidatorInfo(index);

    return {
        pubkey: validatorInfo[0],
        lastAssignmentTime: validatorInfo[1],
        lastRequestedValue: validatorInfo[2],
        lastRequestedBond: validatorInfo[3],

        staked: validatorInfo[4],
        exited: validatorInfo[5],
        inQueue: validatorInfo[6],
        inPrestake: validatorInfo[7],
        expressUsed: validatorInfo[8],
        dissolved: validatorInfo[9],
    }
}

export async function deployMegapool(txOptions) {
    const rocketNodeManager = await RocketNodeManager.deployed();
    const rocketMegapoolFactory = await RocketMegapoolFactory.deployed();

    // Will revert if megapool already exists
    await rocketNodeManager.connect(txOptions.from).deployMegapool();

    // Check `getMegapoolDeployed` returns true
    const existsAfter = await rocketMegapoolFactory.getMegapoolDeployed(txOptions.from.address);
    assert.equal(existsAfter, true, "Megapool was not created");
}

export async function nodeDeposit(node, bondAmount = '4'.ether, useExpressTicket = false, creditAmount = '0'.ether) {
    const [
        rocketNodeDeposit,
        rocketNodeManager,
        rocketMegapoolFactory,
        rocketDepositPool,
        rocketDAOProtocolSettingsDeposit,
        rocketMegapoolManager,
    ] = await Promise.all([
        RocketNodeDeposit.deployed(),
        RocketNodeManager.deployed(),
        RocketMegapoolFactory.deployed(),
        RocketDepositPool.deployed(),
        RocketDAOProtocolSettingsDeposit.deployed(),
        RocketMegapoolManager.deployed(),
    ]);

    // Construct deposit data for prestake
    let withdrawalCredentials = await getMegapoolWithdrawalCredentials(node.address);
    let depositData = {
        pubkey: getValidatorPubkey(),
        withdrawalCredentials: Buffer.from(withdrawalCredentials.substr(2), 'hex'),
        amount: BigInt(1000000000), // gwei
        signature: getValidatorSignature(),
    };
    let depositDataRoot = getDepositDataRoot(depositData);
    let usingCredit = creditAmount > 0n;

    async function getData() {
        let data = await Promise.all([
            rocketMegapoolFactory.getMegapoolDeployed(node.address),
            rocketNodeManager.getExpressTicketCount(node.address),
            rocketMegapoolManager.getValidatorCount(),
            rocketDepositPool.getExpressQueueLength(),
            rocketDepositPool.getStandardQueueLength(),
            rocketDepositPool.getNodeBalance(),
        ]).then(
            ([ deployed, numExpressTickets, numGlobalValidators, expressQueueLength, standardQueueLength, nodeBalance]) =>
                ({ deployed, numExpressTickets, numGlobalValidators, expressQueueLength, standardQueueLength, nodeBalance, numValidators: 0n, assignedValue: 0n, nodeCapital: 0n, userCapital: 0n }),
        );

        if (data.deployed) {
            const megapool = (await getMegapoolForNode(node));
            data.numValidators = await megapool.getValidatorCount();
            data.assignedValue = await megapool.getAssignedValue();
            data.nodeCapital = await megapool.getNodeCapital();
            data.userCapital = await megapool.getUserCapital();
        }

        return data;
    }

    const data1 = await getData();

    const assignmentsEnabled = await rocketDAOProtocolSettingsDeposit.getAssignDepositsEnabled();
    const depositPoolCapacity = await rocketDepositPool.getBalance();
    const amountRequired = '32'.ether - bondAmount;
    const expectAssignment = assignmentsEnabled && depositPoolCapacity >= amountRequired;
    let expectedNodeBalanceChange = bondAmount;

    if (!usingCredit) {
        const tx = await rocketNodeDeposit.connect(node).deposit(bondAmount, useExpressTicket, depositData.pubkey, depositData.signature, depositDataRoot, {value: bondAmount});
        await tx.wait();
    } else {
        const creditBefore = await rocketNodeDeposit.getNodeDepositCredit(node.address);
        const balanceBefore = await rocketNodeDeposit.getNodeEthBalance(node.address);

        const tx = await rocketNodeDeposit.connect(node).depositWithCredit(bondAmount, useExpressTicket, depositData.pubkey, depositData.signature, depositDataRoot, {value: bondAmount - creditAmount});
        await tx.wait();

        const creditAfter = await rocketNodeDeposit.getNodeDepositCredit(node.address);
        const balanceAfter = await rocketNodeDeposit.getNodeEthBalance(node.address);

        const creditAndBalanceDelta = (creditAfter + balanceAfter) - (creditBefore + balanceBefore);
        assertBN.equal(creditAndBalanceDelta, -creditAmount);

        const creditDelta = creditAfter - creditBefore;
        expectedNodeBalanceChange += creditDelta;
    }

    const data2 = await getData();

    if (!data1.deployed) {
        assert.equal(data2.deployed, true, "Megapool was not deployed");
    }

    // Confirm state changes to node
    const numValidatorsDelta = data2.numValidators - data1.numValidators;
    const numGlobalValidatorsDelta = data2.numGlobalValidators - data1.numGlobalValidators;
    const numExpressTicketsDelta = data2.numExpressTickets - data1.numExpressTickets;
    const assignedValueDelta = data2.assignedValue - data1.assignedValue;
    const nodeCapitalDelta = data2.nodeCapital - data1.nodeCapital;
    const userCapitalDelta = data2.userCapital - data1.userCapital;
    const expressQueueLengthDelta = data2.expressQueueLength - data1.expressQueueLength;
    const standardQueueLengthDelta = data2.standardQueueLength - data1.standardQueueLength;
    const nodeBalanceDelta = data2.nodeBalance - data1.nodeBalance;

    assertBN.equal(numValidatorsDelta, 1n, "Number of validators did not increase by 1");
    assertBN.equal(numGlobalValidatorsDelta, 1n, "Number of global validators did not increase by 1");

    if (useExpressTicket) {
        assertBN.equal(numExpressTicketsDelta, -1n, "Did not consume express ticket");
        if (!expectAssignment) {
            assertBN.equal(expressQueueLengthDelta, 1n, "Express queue did not grow by 1");
            assertBN.equal(standardQueueLengthDelta, 0n, "Standard queue grew");
        }
    } else {
        assertBN.equal(numExpressTicketsDelta, 0n, "Express ticket count incorrect");
        if (!expectAssignment) {
            assertBN.equal(expressQueueLengthDelta, 0n, "Express queue grew");
            assertBN.equal(standardQueueLengthDelta, 1n, "Standard queue did not grow by 1");
        }
    }

    // Confirm state of new validator
    const megapool = await getMegapoolForNode(node);
    const validatorInfo = await getValidatorInfo(megapool, data1.numValidators);

    if (expectAssignment) {
        assert.equal(validatorInfo.inQueue, false, "Incorrect validator status");
        assert.equal(validatorInfo.inPrestake, true, "Incorrect validator status");
        assertBN.equal(nodeCapitalDelta, 0n, "Incorrect node capital");
        assertBN.equal(userCapitalDelta, 0n, "Incorrect user capital");
        assertBN.equal(assignedValueDelta, '31'.ether, "Incorrect assigned value");
        assertBN.equal(nodeBalanceDelta, 0n, "Incorrect node balance value");
    } else {
        assert.equal(validatorInfo.inQueue, true, "Incorrect validator status");
        assert.equal(validatorInfo.inPrestake, false, "Incorrect validator status");
        assertBN.equal(nodeCapitalDelta, 0n, "Incorrect node capital");
        assertBN.equal(userCapitalDelta, 0n, "Incorrect user capital");
        assertBN.equal(assignedValueDelta, 0n, "Incorrect assigned value");
        assertBN.equal(nodeBalanceDelta, expectedNodeBalanceChange, "Incorrect node balance value");
    }

    assertBN.equal(validatorInfo.lastRequestedValue, '32'.ether / milliToWei, "Incorrect validator lastRequestedValue");
    assertBN.equal(validatorInfo.lastRequestedBond, bondAmount / milliToWei, "Incorrect validator lastRequestedBond");

    assert.equal(validatorInfo.staked, false, "Incorrect validator status");
    assert.equal(validatorInfo.dissolved, false, "Incorrect validator status");
    assert.equal(validatorInfo.exited, false, "Incorrect validator status");
    assert.equal(validatorInfo.expressUsed, useExpressTicket, "Incorrect validator express ticket usage");
    assert.equal(validatorInfo.pubkey, '0x' + depositData.pubkey.toString('hex'), "Incorrect validator pubkey");
}

export async function getMegapoolWithdrawalCredentials(nodeAddress) {
    const rocketMegapoolFactory = await RocketMegapoolFactory.deployed();
    const megapoolAddress = await rocketMegapoolFactory.getExpectedAddress(nodeAddress);
    return '0x010000000000000000000000' + megapoolAddress.substr(2);
}

export async function getMegapoolForNode(node) {
    const rocketMegapoolFactory = await RocketMegapoolFactory.deployed();
    const megapoolAddress = await rocketMegapoolFactory.getExpectedAddress(node.address);

    const delegateAbi = artifacts.require('RocketMegapoolDelegate').abi;
    const proxyAbi = artifacts.require('RocketMegapoolProxy').abi;

    const combinedAbi = [...delegateAbi, ...proxyAbi].filter(fragment => fragment.type !== 'constructor');

    return new ethers.Contract(megapoolAddress, combinedAbi, node);
}

export async function findInQueue(megapoolAddress, validatorId, queueKey, indexOffset = 0n, positionOffset = 0n) {
    const maxSliceLength = 100n; // Number of entries to scan per call

    validatorId = BigInt(validatorId);

    const linkedListStorage = await LinkedListStorage.deployed();
    const scan = await linkedListStorage.scan(ethers.solidityPackedKeccak256(['string'], [queueKey]), indexOffset, maxSliceLength);

    for (const entry of scan[0]) {
        if (entry[0].toLowerCase() === megapoolAddress.toLowerCase()) {
            if (entry[1] === validatorId) {
                // Found the entry
                return positionOffset;
            }
        }
        positionOffset += 1n;
    }

    if (scan[1] === 0n) {
        // We hit the end of the queue without finding the entry
        return null;
    } else {
        // Nothing in this slice, recurse until end of queue is reached
        return await findInQueue(megapoolAddress, validatorId, queueKey, scan[1], positionOffset);
    }
}

export async function calculatePositionInQueue(megapool, validatorId) {
    const { expressUsed } = await getValidatorInfo(megapool, validatorId);

    const queueKeyString = expressUsed ? 'deposit.queue.express' : 'deposit.queue.standard';
    const position = await findInQueue(megapool.target, validatorId, queueKeyString);

    if (position === null) {
        // Not found in the queue
        return null;
    }

    const linkedListStorage = await LinkedListStorage.deployed();
    const rocketDepositPool = await RocketDepositPool.deployed();
    const rocketDAOProtocolSettingsDeposit = await RocketDAOProtocolSettingsDeposit.deployed();

    const expressQueueLength = await linkedListStorage.getLength(ethers.solidityPackedKeccak256(['string'], ['deposit.queue.express']));
    const standardQueueLength = await linkedListStorage.getLength(ethers.solidityPackedKeccak256(['string'], ['deposit.queue.standard']));
    const queueIndex = await rocketDepositPool.getQueueIndex();
    const expressQueueRate = await rocketDAOProtocolSettingsDeposit.getExpressQueueRate();
    const queueInterval = expressQueueRate + 1n;

    if (expressUsed) {
        let standardEntriesBefore = (position + (queueIndex % queueInterval)) / expressQueueRate;
        if (standardEntriesBefore > standardQueueLength) {
            standardEntriesBefore = standardQueueLength;
        }
        return position + standardEntriesBefore;
    } else {
        let expressEntriesBefore = (position * expressQueueLength) + (expressQueueRate - (queueIndex % queueInterval));
        if (expressEntriesBefore > expressQueueLength) {
            expressEntriesBefore = expressQueueLength;
        }
        return position + expressEntriesBefore;
    }
}