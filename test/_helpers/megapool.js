import { assertBN } from './bn';
import * as assert from 'assert';
import {
    artifacts,
    LinkedListStorage,
    RocketDAOProtocolSettingsDeposit,
    RocketDepositPool,
    RocketMegapoolDelegate,
    RocketMegapoolFactory,
    RocketMegapoolManager,
    RocketNodeDeposit,
    RocketNodeManager,
    RocketNodeStaking,
} from '../_utils/artifacts';
import { getDepositDataRoot, getValidatorPubkey, getValidatorSignature } from '../_utils/beacon';

const hre = require('hardhat');
const ethers = hre.ethers;

const launchValue = '32'.ether;
const milliToWei = 1000000000000000n;

export async function getValidatorInfo(megapool, index) {
    const [validatorInfo, pubkey] = await megapool.getValidatorInfoAndPubkey(index);

    return {
        pubkey,

        lastAssignmentTime: validatorInfo[0],
        lastRequestedValue: validatorInfo[1],
        lastRequestedBond: validatorInfo[2],
        depositValue: validatorInfo[3],

        staked: validatorInfo[4],
        exited: validatorInfo[5],
        inQueue: validatorInfo[6],
        inPrestake: validatorInfo[7],
        expressUsed: validatorInfo[8],
        dissolved: validatorInfo[9],
        exiting: validatorInfo[10],
        locked: validatorInfo[11],

        validatorIndex: validatorInfo[12],
        exitBalance: validatorInfo[13],
        withdrawableEpoch: validatorInfo[14],
        lockedSlot: validatorInfo[15],
    };
}

export async function deployMegapool(txOptions) {
    const rocketNodeManager = await RocketNodeManager.deployed();
    const rocketMegapoolFactory = await RocketMegapoolFactory.deployed();

    // Will revert if megapool already exists
    await rocketNodeManager.connect(txOptions.from).deployMegapool();

    // Check `getMegapoolDeployed` returns true
    const existsAfter = await rocketMegapoolFactory.getMegapoolDeployed(txOptions.from.address);
    assert.equal(existsAfter, true, 'Megapool was not created');
}

export async function nodeDeposit(node, bondAmount = '4'.ether, useExpressTicket = false, creditAmount = '0'.ether) {
    const [
        rocketNodeDeposit,
        rocketNodeManager,
        rocketNodeStaking,
        rocketMegapoolFactory,
        rocketDepositPool,
        rocketDAOProtocolSettingsDeposit,
        rocketMegapoolManager,
    ] = await Promise.all([
        RocketNodeDeposit.deployed(),
        RocketNodeManager.deployed(),
        RocketNodeStaking.deployed(),
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

    const queueIndex = await rocketDepositPool.getQueueIndex();
    const expressQueueRate = await rocketDAOProtocolSettingsDeposit.getExpressQueueRate();
    const nextAssignmentIsExpress = queueIndex % (expressQueueRate + 1n) !== 0n;

    async function getData() {
        let data = await Promise.all([
            rocketMegapoolFactory.getMegapoolDeployed(node.address),
            rocketNodeManager.getExpressTicketCount(node.address),
            rocketMegapoolManager.getValidatorCount(),
            rocketDepositPool.getExpressQueueLength(),
            rocketDepositPool.getStandardQueueLength(),
            rocketDepositPool.getNodeBalance(),
            rocketNodeStaking.getNodeETHBorrowed(node.address),
            rocketNodeStaking.getNodeETHBonded(node.address),
            rocketNodeStaking.getNodeMegapoolETHBorrowed(node.address),
            rocketNodeStaking.getNodeMegapoolETHBonded(node.address),
            rocketDepositPool.getMinipoolQueueLength(),
        ]).then(
            ([deployed, numExpressTickets, numGlobalValidators, expressQueueLength, standardQueueLength, nodeBalance,
                 nodeEthBorrowed, nodeEthBonded, nodeMegapoolEthBorrowed, nodeMegapoolEthBonded, minipoolQueueLength]) =>
                ({
                    deployed,
                    numExpressTickets,
                    numGlobalValidators,
                    expressQueueLength,
                    standardQueueLength,
                    nodeBalance,
                    nodeEthBorrowed,
                    nodeEthBonded,
                    nodeMegapoolEthBorrowed,
                    nodeMegapoolEthBonded,
                    minipoolQueueLength,
                    numValidators: 0n,
                    assignedValue: 0n,
                    nodeBond: 0n,
                    nodeQueuedCapital: 0n,
                    userCapital: 0n,
                    userQueuedCapital: 0n,
                }),
        );

        if (data.deployed) {
            const megapool = (await getMegapoolForNode(node));
            data.numValidators = await megapool.getValidatorCount();
            data.assignedValue = await megapool.getAssignedValue();
            data.nodeBond = await megapool.getNodeBond();
            data.nodeQueuedCapital = await megapool.getNodeQueuedBond();
            data.userCapital = await megapool.getUserCapital();
            data.userQueuedCapital = await megapool.getUserQueuedCapital();
        }

        return data;
    }

    const data1 = await getData();

    const assignmentsEnabled = await rocketDAOProtocolSettingsDeposit.getAssignDepositsEnabled();
    const depositPoolCapacity = await rocketDepositPool.getBalance();
    const amountRequired = '32'.ether - bondAmount;
    let expectedNodeBalanceChange = bondAmount;

    if (!usingCredit) {
        const tx = await rocketNodeDeposit.connect(node).deposit(bondAmount, useExpressTicket, depositData.pubkey, depositData.signature, depositDataRoot, { value: bondAmount });
        await tx.wait();
    } else {
        const tx = await rocketNodeDeposit.connect(node).depositWithCredit(bondAmount, useExpressTicket, depositData.pubkey, depositData.signature, depositDataRoot, { value: bondAmount - creditAmount });
        await tx.wait();
    }

    const data2 = await getData();

    if (!data1.deployed) {
        assert.equal(data2.deployed, true, 'Megapool was not deployed');
    }

    // Confirm state changes to node
    const numValidatorsDelta = data2.numValidators - data1.numValidators;
    const numGlobalValidatorsDelta = data2.numGlobalValidators - data1.numGlobalValidators;
    const numExpressTicketsDelta = data2.numExpressTickets - data1.numExpressTickets;
    const assignedValueDelta = data2.assignedValue - data1.assignedValue;
    const nodeBondDelta = data2.nodeBond - data1.nodeBond;
    const nodeQueuedBondDelta = data2.nodeQueuedCapital - data1.nodeQueuedCapital;
    const userCapitalDelta = data2.userCapital - data1.userCapital;
    const userQueuedCapitalDelta = data2.userQueuedCapital - data1.userQueuedCapital;
    const expressQueueLengthDelta = data2.expressQueueLength - data1.expressQueueLength;
    const standardQueueLengthDelta = data2.standardQueueLength - data1.standardQueueLength;
    const nodeBalanceDelta = data2.nodeBalance - data1.nodeBalance;
    const nodeEthBondedDelta = data2.nodeEthBonded - data1.nodeEthBonded;
    const nodeEthBorrowedDelta = data2.nodeEthBorrowed - data1.nodeEthBorrowed;

    assertBN.equal(nodeEthBondedDelta, bondAmount);
    assertBN.equal(nodeEthBorrowedDelta, '32'.ether - bondAmount);

    assertBN.equal(data2.nodeBond + data2.nodeQueuedCapital, data2.nodeMegapoolEthBonded);
    assertBN.equal(data2.userCapital + data2.userQueuedCapital, data2.nodeMegapoolEthBorrowed);

    assertBN.equal(numValidatorsDelta, 1n, 'Number of validators did not increase by 1');
    assertBN.equal(numGlobalValidatorsDelta, 1n, 'Number of global validators did not increase by 1');

    const minipoolInQueue = data1.minipoolQueueLength > 0n;

    const expectSelfAssignment =
        !minipoolInQueue &&
        assignmentsEnabled &&
        depositPoolCapacity >= amountRequired &&
        (
            nextAssignmentIsExpress && data1.expressQueueLength === 0n ||
            !nextAssignmentIsExpress && data1.standardQueueLength === 0n
        );

    if (useExpressTicket) {
        assertBN.equal(numExpressTicketsDelta, -1n, 'Did not consume express ticket');
        if (!expectSelfAssignment) {
            assertBN.equal(expressQueueLengthDelta, 1n, 'Express queue did not grow by 1');
            assertBN.equal(standardQueueLengthDelta, 0n, 'Standard queue grew');
        }
    } else {
        assertBN.equal(numExpressTicketsDelta, 0n, 'Express ticket count incorrect');
        if (!expectSelfAssignment) {
            assertBN.equal(expressQueueLengthDelta, 0n, 'Express queue grew');
            assertBN.equal(standardQueueLengthDelta, 1n, 'Standard queue did not grow by 1');
        }
    }

    // Confirm state of new validator
    const megapool = await getMegapoolForNode(node);
    const validatorInfo = await getValidatorInfo(megapool, data1.numValidators);

    assertBN.equal(nodeBondDelta + nodeQueuedBondDelta, bondAmount, 'Incorrect node capital');
    assertBN.equal(userCapitalDelta + userQueuedCapitalDelta, '32'.ether - bondAmount, 'Incorrect user capital');

    if (minipoolInQueue) {
        // Validator will never be assigned if a minipool exists in the queue as it is serviced first
        assert.equal(validatorInfo.inQueue, true, 'Incorrect validator status');
        assert.equal(validatorInfo.inPrestake, false, 'Incorrect validator status');
        assertBN.equal(assignedValueDelta, 0n, 'Incorrect assigned value');
        assertBN.equal(userQueuedCapitalDelta, launchValue - bondAmount);
        assertBN.equal(nodeQueuedBondDelta, bondAmount);
    }
    else if (expectSelfAssignment)
    {
        assert.equal(validatorInfo.inQueue, false, 'Incorrect validator status');
        assert.equal(validatorInfo.inPrestake, true, 'Incorrect validator status');
        assertBN.equal(assignedValueDelta, '31'.ether, 'Incorrect assigned value');
        assertBN.equal(nodeBalanceDelta, 0n, 'Incorrect node balance value');
        // If validator is assigned immediately, then there should be no change in queued capital balances
        assertBN.equal(nodeQueuedBondDelta, 0n);
        assertBN.equal(userQueuedCapitalDelta, 0n);
    }
    else
    {
        assert.equal(validatorInfo.inQueue, true, 'Incorrect validator status');
        assert.equal(validatorInfo.inPrestake, false, 'Incorrect validator status');
        assertBN.equal(assignedValueDelta, 0n, 'Incorrect assigned value');
        assertBN.equal(nodeBalanceDelta, expectedNodeBalanceChange, 'Incorrect node balance value');
        assertBN.equal(userQueuedCapitalDelta, launchValue - bondAmount);
        assertBN.equal(nodeQueuedBondDelta, bondAmount);
    }

    assertBN.equal(validatorInfo.lastRequestedValue, '32'.ether / milliToWei, 'Incorrect validator lastRequestedValue');
    assertBN.equal(validatorInfo.lastRequestedBond, bondAmount / milliToWei, 'Incorrect validator lastRequestedBond');

    assert.equal(validatorInfo.staked, false, 'Incorrect validator status');
    assert.equal(validatorInfo.dissolved, false, 'Incorrect validator status');
    assert.equal(validatorInfo.exited, false, 'Incorrect validator status');
    assert.equal(validatorInfo.expressUsed, useExpressTicket, 'Incorrect validator express ticket usage');
    assert.equal(validatorInfo.pubkey, '0x' + depositData.pubkey.toString('hex'), 'Incorrect validator pubkey');
}

export async function nodeDepositMulti(node, deposits, creditAmount = 0n) {
    const [
        rocketNodeDeposit,
        rocketNodeManager,
        rocketNodeStaking,
        rocketMegapoolFactory,
        rocketDepositPool,
        rocketDAOProtocolSettingsDeposit,
        rocketMegapoolManager,
    ] = await Promise.all([
        RocketNodeDeposit.deployed(),
        RocketNodeManager.deployed(),
        RocketNodeStaking.deployed(),
        RocketMegapoolFactory.deployed(),
        RocketDepositPool.deployed(),
        RocketDAOProtocolSettingsDeposit.deployed(),
        RocketMegapoolManager.deployed(),
    ]);

    const depositParams = [];

    const withdrawalCredentials = await getMegapoolWithdrawalCredentials(node.address);
    let totalBond = 0n;
    let totalExpressTickets = 0;
    let pubkeys = [];

    for (let i = 0; i < deposits.length; i++) {
        let depositData = {
            pubkey: getValidatorPubkey(),
            withdrawalCredentials: Buffer.from(withdrawalCredentials.substr(2), 'hex'),
            amount: BigInt(1000000000), // gwei
            signature: getValidatorSignature(),
        };
        let depositDataRoot = getDepositDataRoot(depositData);

        depositParams.push({
            bondAmount: deposits[i].bondAmount,
            useExpressTicket: deposits[i].useExpressTicket,
            validatorPubkey: depositData.pubkey,
            validatorSignature: depositData.signature,
            depositDataRoot: depositDataRoot,
        });

        pubkeys.push(depositData.pubkey);
        totalBond += deposits[i].bondAmount;
        totalExpressTickets += Number(deposits[i].useExpressTicket);
    }

    // Construct deposit data for prestake
    let msgValue = totalBond - creditAmount;

    async function getData() {
        let data = await Promise.all([
            rocketMegapoolFactory.getMegapoolDeployed(node.address),
            rocketNodeManager.getExpressTicketCount(node.address),
            rocketMegapoolManager.getValidatorCount(),
            rocketDepositPool.getExpressQueueLength(),
            rocketDepositPool.getStandardQueueLength(),
            rocketDepositPool.getNodeBalance(),
            rocketNodeStaking.getNodeETHBorrowed(node.address),
            rocketNodeStaking.getNodeETHBonded(node.address),
            rocketNodeStaking.getNodeMegapoolETHBorrowed(node.address),
            rocketNodeStaking.getNodeMegapoolETHBonded(node.address),
        ]).then(
            ([deployed, numExpressTickets, numGlobalValidators, expressQueueLength, standardQueueLength, nodeBalance,
                 nodeEthBorrowed, nodeEthBonded, nodeMegapoolEthBorrowed, nodeMegapoolEthBonded]) =>
                ({
                    deployed,
                    numExpressTickets,
                    numGlobalValidators,
                    expressQueueLength,
                    standardQueueLength,
                    nodeBalance,
                    nodeEthBorrowed,
                    nodeEthBonded,
                    nodeMegapoolEthBorrowed,
                    nodeMegapoolEthBonded,
                    numValidators: 0n,
                    assignedValue: 0n,
                    nodeBond: 0n,
                    userCapital: 0n,
                    nodeQueuedBond: 0n,
                    userQueuedCapital: 0n,
                }),
        );

        if (data.deployed) {
            const megapool = (await getMegapoolForNode(node));
            data.numValidators = await megapool.getValidatorCount();
            data.assignedValue = await megapool.getAssignedValue();
            data.nodeBond = await megapool.getNodeBond();
            data.userCapital = await megapool.getUserCapital();
            data.nodeQueuedBond = await megapool.getNodeQueuedBond();
            data.userQueuedCapital = await megapool.getUserQueuedCapital();
        }

        return data;
    }

    const data1 = await getData();

    const assignmentsEnabled = await rocketDAOProtocolSettingsDeposit.getAssignDepositsEnabled();

    let expectedAssignments = 0;
    let expectedExpressAssignments = 0;
    let expectedNodeBalanceChange = 0n;

    if (assignmentsEnabled) {
        let depositPoolCapacity = await rocketDepositPool.getBalance();

        for (let i = 0; i < deposits.length; ++i) {
            const amountRequired = '32'.ether - deposits[i].bondAmount;
            if (depositPoolCapacity >= amountRequired) {
                expectedAssignments += 1;
                depositPoolCapacity -= amountRequired;

                if (deposits[i].useExpressTicket) {
                    expectedExpressAssignments += 1;
                }
            } else {
                expectedNodeBalanceChange += deposits[i].bondAmount;
            }
        }
    }

    const creditBefore = await rocketNodeDeposit.getNodeDepositCredit(node.address);
    const balanceBefore = await rocketNodeDeposit.getNodeEthBalance(node.address);

    const tx = await rocketNodeDeposit.connect(node).depositMulti(depositParams, { value: msgValue });
    await tx.wait();

    const creditAfter = await rocketNodeDeposit.getNodeDepositCredit(node.address);
    const balanceAfter = await rocketNodeDeposit.getNodeEthBalance(node.address);

    const creditAndBalanceDelta = (creditAfter + balanceAfter) - (creditBefore + balanceBefore);
    assertBN.equal(creditAndBalanceDelta, -creditAmount);

    const creditDelta = creditAfter - creditBefore;
    expectedNodeBalanceChange += creditDelta;

    const data2 = await getData();

    if (!data1.deployed) {
        assert.equal(data2.deployed, true, 'Megapool was not deployed');
    }

    // Confirm state changes to node
    const numValidatorsDelta = data2.numValidators - data1.numValidators;
    const numGlobalValidatorsDelta = data2.numGlobalValidators - data1.numGlobalValidators;
    const numExpressTicketsDelta = data2.numExpressTickets - data1.numExpressTickets;
    const assignedValueDelta = data2.assignedValue - data1.assignedValue;
    const nodeBondDelta = data2.nodeBond - data1.nodeBond;
    const nodeQueuedBondDelta = data2.nodeQueuedBond - data1.nodeQueuedBond;
    const userCapitalDelta = data2.userCapital - data1.userCapital;
    const userQueuedCapitalDelta = data2.userQueuedCapital - data1.userQueuedCapital;
    const expressQueueLengthDelta = data2.expressQueueLength - data1.expressQueueLength;
    const standardQueueLengthDelta = data2.standardQueueLength - data1.standardQueueLength;
    const nodeBalanceDelta = data2.nodeBalance - data1.nodeBalance;
    const nodeEthBondedDelta = data2.nodeEthBonded - data1.nodeEthBonded;
    const nodeEthBorrowedDelta = data2.nodeEthBorrowed - data1.nodeEthBorrowed;

    assertBN.equal(nodeEthBondedDelta, totalBond);
    assertBN.equal(nodeEthBorrowedDelta, ('32'.ether * BigInt(deposits.length)) - totalBond);

    assertBN.equal(data2.nodeBond + data2.nodeQueuedBond, data2.nodeMegapoolEthBonded);
    assertBN.equal(data2.userCapital + data2.userQueuedCapital, data2.nodeMegapoolEthBorrowed);

    assertBN.equal(numValidatorsDelta, BigInt(deposits.length), 'Number of validators did not increase by 1');
    assertBN.equal(numGlobalValidatorsDelta, BigInt(deposits.length), 'Number of global validators did not increase by 1');

    assertBN.equal(numExpressTicketsDelta, BigInt(-totalExpressTickets), 'Did not consume express tickets');

    // Confirm state of new validator
    const megapool = await getMegapoolForNode(node);

    assertBN.equal(nodeBondDelta + nodeQueuedBondDelta, totalBond, 'Incorrect node capital');
    assertBN.equal(userCapitalDelta + userQueuedCapitalDelta, ('32'.ether * BigInt(deposits.length)) - totalBond, 'Incorrect user capital');

    for (let i = 0; i < deposits.length; ++i) {
        const validatorId = Number(data1.numValidators) + i;
        const validatorInfo = await getValidatorInfo(megapool, validatorId);

        assertBN.equal(validatorInfo.lastRequestedValue, '32'.ether / milliToWei, 'Incorrect validator lastRequestedValue');
        assertBN.equal(validatorInfo.lastRequestedBond, deposits[i].bondAmount / milliToWei, 'Incorrect validator lastRequestedBond');

        assert.equal(validatorInfo.staked, false, 'Incorrect validator status');
        assert.equal(validatorInfo.dissolved, false, 'Incorrect validator status');
        assert.equal(validatorInfo.exited, false, 'Incorrect validator status');
        assert.equal(validatorInfo.expressUsed, deposits[i].useExpressTicket, 'Incorrect validator express ticket usage');
        assert.equal(validatorInfo.pubkey, '0x' + pubkeys[i].toString('hex'), 'Incorrect validator pubkey');
    }
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