import { getMegapoolForNode } from '../_helpers/megapool';
import assert from 'assert';
import { RocketDepositPool, RocketNodeDeposit, RocketNodeStaking } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

export async function exitQueue(nodeAddress, validatorIndex) {
    const megapool = await getMegapoolForNode(nodeAddress)

    const rocketNodeStaking = await RocketNodeStaking.deployed();
    const rocketDepositPool = await RocketDepositPool.deployed();
    const rocketNodeDeposit = await RocketNodeDeposit.deployed();

    async function getData() {
        return await Promise.all([
            rocketNodeStaking.getNodeETHBorrowed(nodeAddress),
            rocketNodeStaking.getNodeETHBonded(nodeAddress),
            rocketNodeStaking.getNodeMegapoolETHBorrowed(nodeAddress),
            rocketNodeStaking.getNodeMegapoolETHBonded(nodeAddress),
            megapool.getNodeBond(),
            megapool.getUserCapital(),
            megapool.getActiveValidatorCount(),
            rocketDepositPool.getNodeCreditBalance(nodeAddress)
        ]).then(
            ([nodeEthBorrowed, nodeEthBonded, nodeMegapoolEthBorrowed, nodeMegapoolEthBonded, nodeBond, userCapital, validatorCount, nodeCredit]) =>
                ({ nodeEthBorrowed, nodeEthBonded, nodeMegapoolEthBorrowed, nodeMegapoolEthBonded, nodeBond, userCapital, validatorCount, nodeCredit }),
        );
    }

    const activeValidatorCountBefore = await megapool.getActiveValidatorCount();

    // Dequeue the validator
    const data1 = await getData();
    await megapool.dequeue(validatorIndex);
    const data2 = await getData();

    const activeValidatorCount = await megapool.getActiveValidatorCount();

    // Calculate new bond requirement
    let bondRequirement = 0n;
    if (activeValidatorCountBefore > 1n) {
        bondRequirement = await rocketNodeDeposit.getBondRequirement(activeValidatorCountBefore - 1n);
    }

    // Calculate expected change in bond and capital
    let expectedNodeBondChange = bondRequirement - data1.nodeBond;
    if (expectedNodeBondChange < -'32'.ether) {
        expectedNodeBondChange = -'32'.ether
    }
    const expectedUserCapitalChange = -'32'.ether - expectedNodeBondChange;

    let expectedCredit = 0n;
    if (bondRequirement < data1.nodeBond) {
        expectedCredit = data1.nodeBond - bondRequirement;

        if (expectedCredit > '32'.ether) {
            expectedCredit = '32'.ether;
        }
    }

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
        nodeCredit: data2.nodeCredit - data1.nodeCredit,
    }

    assertBN.equal(deltas.nodeEthBonded, expectedNodeBondChange);
    assertBN.equal(deltas.nodeEthBorrowed, expectedUserCapitalChange);
    assertBN.equal(deltas.nodeMegapoolEthBonded, expectedNodeBondChange);
    assertBN.equal(deltas.nodeMegapoolEthBorrowed, expectedUserCapitalChange);
    assertBN.equal(deltas.nodeBond, expectedNodeBondChange);
    assertBN.equal(deltas.userCapital, expectedUserCapitalChange);
    assertBN.equal(data2.userCapital, data2.nodeMegapoolEthBorrowed);
    assertBN.equal(data2.nodeBond, data2.nodeMegapoolEthBonded);
    assertBN.equal(deltas.nodeBond + deltas.userCapital, -'32'.ether);
    assertBN.equal(deltas.nodeCredit, expectedCredit);
    assertBN.equal(activeValidatorCount, activeValidatorCountBefore - 1n);
}