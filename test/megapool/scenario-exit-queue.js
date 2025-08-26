import { getMegapoolForNode, getValidatorInfo } from '../_helpers/megapool';
import assert from 'assert';
import { RocketDepositPool, RocketNodeDeposit, RocketNodeStaking } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

const launchValue = '32'.ether;
const milliToWei = 1000000000000000n;

export async function exitQueue(nodeAddress, validatorIndex) {
    const megapool = await getMegapoolForNode(nodeAddress)

    const rocketNodeStaking = await RocketNodeStaking.deployed();
    const rocketDepositPool = await RocketDepositPool.deployed();

    async function getData() {
        return await Promise.all([
            rocketNodeStaking.getNodeETHBorrowed(nodeAddress),
            rocketNodeStaking.getNodeETHBonded(nodeAddress),
            rocketNodeStaking.getNodeMegapoolETHBorrowed(nodeAddress),
            rocketNodeStaking.getNodeMegapoolETHBonded(nodeAddress),
            megapool.getNodeBond(),
            megapool.getUserCapital(),
            megapool.getNodeQueuedBond(),
            megapool.getUserQueuedCapital(),
            megapool.getActiveValidatorCount(),
            rocketDepositPool.getNodeCreditBalance(nodeAddress)
        ]).then(
            ([nodeEthBorrowed, nodeEthBonded, nodeMegapoolEthBorrowed, nodeMegapoolEthBonded, nodeBond, userCapital, nodeQueuedBond, userQueuedCapital, validatorCount, nodeCredit]) =>
                ({ nodeEthBorrowed, nodeEthBonded, nodeMegapoolEthBorrowed, nodeMegapoolEthBonded, nodeBond, userCapital, nodeQueuedBond, userQueuedCapital, validatorCount, nodeCredit }),
        );
    }

    const activeValidatorCountBefore = await megapool.getActiveValidatorCount();

    const validatorInfo = await getValidatorInfo(megapool, validatorIndex)

    // Dequeue the validator
    const data1 = await getData();
    await megapool.dequeue(validatorIndex);
    const data2 = await getData();

    const activeValidatorCount = await megapool.getActiveValidatorCount();

    // Calculate expected change in bond and capital
    const lastRequestedBond = BigInt(validatorInfo.lastRequestedBond) * milliToWei;
    const lastRequestedValue = BigInt(validatorInfo.lastRequestedValue) * milliToWei;
    const expectedNodeBondChange = -lastRequestedBond;
    const expectedUserCapitalChange = -(lastRequestedValue - lastRequestedBond);
    const expectedCredit = lastRequestedBond;

    // Check the validator status
    const validatorInfoAfter = await megapool.getValidatorInfo(validatorIndex);
    assert.equal(validatorInfoAfter.staked, false);
    assert.equal(validatorInfoAfter.inQueue, false);

    const deltas = {
        nodeEthBonded: data2.nodeEthBonded - data1.nodeEthBonded,
        nodeEthBorrowed: data2.nodeEthBorrowed - data1.nodeEthBorrowed,
        nodeMegapoolEthBonded: data2.nodeMegapoolEthBonded - data1.nodeMegapoolEthBonded,
        nodeMegapoolEthBorrowed:data2.nodeMegapoolEthBorrowed - data1.nodeMegapoolEthBorrowed,
        nodeBond:data2.nodeBond - data1.nodeBond,
        userCapital: data2.userCapital - data1.userCapital,
        nodeQueuedBond: data2.nodeQueuedBond - data1.nodeQueuedBond,
        userQueuedCapital: data2.userQueuedCapital - data1.userQueuedCapital,
        nodeCredit: data2.nodeCredit - data1.nodeCredit,
    }

    assertBN.equal(deltas.nodeEthBonded, expectedNodeBondChange);
    assertBN.equal(deltas.nodeEthBorrowed, expectedUserCapitalChange);
    assertBN.equal(deltas.nodeMegapoolEthBonded, expectedNodeBondChange);
    assertBN.equal(deltas.nodeMegapoolEthBorrowed, expectedUserCapitalChange);
    assertBN.equal(deltas.nodeBond, 0n);
    assertBN.equal(deltas.nodeQueuedBond, expectedNodeBondChange);
    assertBN.equal(deltas.userCapital, 0n);
    assertBN.equal(deltas.userQueuedCapital, expectedUserCapitalChange);
    assertBN.equal(data2.userCapital + data2.userQueuedCapital, data2.nodeMegapoolEthBorrowed);
    assertBN.equal(data2.nodeBond + data2.nodeQueuedBond, data2.nodeMegapoolEthBonded);
    assertBN.equal(deltas.nodeBond + deltas.userCapital + deltas.nodeQueuedBond + deltas.userQueuedCapital, -launchValue);
    assertBN.equal(deltas.nodeCredit, expectedCredit);
    assertBN.equal(activeValidatorCount, activeValidatorCountBefore - 1n);
}