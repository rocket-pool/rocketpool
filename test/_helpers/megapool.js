import { assertBN } from './bn';
import * as assert from 'assert';
import {
    artifacts, RocketDepositPool,
    RocketMegapoolDelegate,
    RocketMegapoolFactory,
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

        active: validatorInfo[4],
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

export async function nodeDeposit(useExpressTicket, useCredit, txOptions) {
    const [
        rocketNodeDeposit,
        rocketNodeStaking,
        rocketNodeManager,
        rocketMegapoolFactory,
        rocketDepositPool,
    ] = await Promise.all([
        RocketNodeDeposit.deployed(),
        RocketNodeStaking.deployed(),
        RocketNodeManager.deployed(),
        RocketMegapoolFactory.deployed(),
        RocketDepositPool.deployed(),
    ]);

    // Construct deposit data for prestake
    let withdrawalCredentials = await getMegapoolWithdrawalCredentials(txOptions.from.address);
    let depositData = {
        pubkey: getValidatorPubkey(),
        withdrawalCredentials: Buffer.from(withdrawalCredentials.substr(2), 'hex'),
        amount: BigInt(1000000000), // gwei
        signature: getValidatorSignature(),
    };
    let depositDataRoot = getDepositDataRoot(depositData);

    async function getData() {
        let data = await Promise.all([
            rocketMegapoolFactory.getMegapoolDeployed(txOptions.from.address),
            rocketNodeManager.getExpressTicketCount(txOptions.from.address),
        ]).then(
            ([ deployed, numExpressTickets]) =>
                ({ deployed, numExpressTickets, numValidators: 0n, assignedValue: 0n, nodeCapital: 0n, userCapital: 0n }),
        );

        if (data.deployed) {
            const megapool = (await getMegapoolForNode(txOptions.from));
            data.numValidators = await megapool.getValidatorCount();
            data.assignedValue = await megapool.getAssignedValue();
            data.nodeCapital = await megapool.getNodeCapital();
            data.userCapital = await megapool.getUserCapital();
        }

        return data;
    }

    const data1 = await getData();

    const depositPoolCapacity = await rocketDepositPool.getBalance();
    const amountRequired = '32'.ether - txOptions.value;
    const expectAssignment = depositPoolCapacity >= amountRequired;

    const tx = await rocketNodeDeposit.connect(txOptions.from).deposit(txOptions.value, useExpressTicket, depositData.pubkey, depositData.signature, depositDataRoot, txOptions);
    await tx.wait();

    const data2 = await getData();

    if (!data1.deployed) {
        assert.equal(data2.deployed, true, "Megapool was not deployed");
    }

    // Confirm state changes to node
    const numValidatorsDelta = data2.numValidators - data1.numValidators;
    const numExpressTicketsDelta = data2.numExpressTickets - data1.numExpressTickets;
    const assignedValueDelta = data2.assignedValue - data1.assignedValue;
    const nodeCapitalDelta = data2.nodeCapital - data1.nodeCapital;
    const userCapitalDelta = data2.userCapital - data1.userCapital;

    assertBN.equal(numValidatorsDelta, 1n, "Number of validators did not increase by 1");

    if (useExpressTicket) {
        assertBN.equal(numExpressTicketsDelta, -1n, "Did not consume express ticket");
    } else {
        assertBN.equal(numExpressTicketsDelta, 0n, "Express ticket count incorrect");
    }

    // Confirm state of new validator
    const megapool = await getMegapoolForNode(txOptions.from);
    const validatorInfo = await getValidatorInfo(megapool, data1.numValidators);

    if (expectAssignment) {
        assert.equal(validatorInfo.inQueue, false, "Incorrect validator status");
        assert.equal(validatorInfo.inPrestake, true, "Incorrect validator status");
        assertBN.equal(nodeCapitalDelta, 0n, "Incorrect node capital");
        assertBN.equal(userCapitalDelta, 0n, "Incorrect user capital");
        assertBN.equal(assignedValueDelta, '31'.ether, "Incorrect assigned value");
    } else {
        assert.equal(validatorInfo.inQueue, true, "Incorrect validator status");
        assert.equal(validatorInfo.inPrestake, false, "Incorrect validator status");
        assertBN.equal(nodeCapitalDelta, 0n, "Incorrect node capital");
        assertBN.equal(userCapitalDelta, 0n, "Incorrect user capital");
        assertBN.equal(assignedValueDelta, 0n, "Incorrect assigned value");
    }

    assertBN.equal(validatorInfo.lastRequestedValue, '32'.ether / milliToWei, "Incorrect validator lastRequestedValue");
    assertBN.equal(validatorInfo.lastRequestedBond, txOptions.value / milliToWei, "Incorrect validator lastRequestedBond");

    assert.equal(validatorInfo.active, false, "Incorrect validator status");
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