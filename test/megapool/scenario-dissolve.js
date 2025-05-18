import { getMegapoolForNode } from '../_helpers/megapool';
import { RocketNodeStaking } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

export async function dissolveValidator(node, validatorIndex, from = node) {
    const megapool = await getMegapoolForNode(node)

    const [
        rocketNodeStaking,
    ] = await Promise.all([
        RocketNodeStaking.deployed(),
    ]);

    const nodeAddress = await megapool.getNodeAddress();

    async function getData() {
        return await Promise.all([
            rocketNodeStaking.getNodeETHBorrowed(nodeAddress),
            rocketNodeStaking.getNodeETHBonded(nodeAddress),
            rocketNodeStaking.getNodeMegapoolETHBorrowed(nodeAddress),
            rocketNodeStaking.getNodeMegapoolETHBonded(nodeAddress),
            megapool.getNodeBond(),
            megapool.getUserCapital(),
        ]).then(
            ([nodeEthBorrowed, nodeEthBonded, nodeMegapoolEthBorrowed, nodeMegapoolEthBonded, nodeBond, userCapital]) =>
                ({ nodeEthBorrowed, nodeEthBonded, nodeMegapoolEthBorrowed, nodeMegapoolEthBonded, nodeBond, userCapital }),
        );
    }

    // Calculate new bond requirement
    const activeValidatorCount = await megapool.getActiveValidatorCount();
    let bondRequirement = 0n;
    if (activeValidatorCount > 1n) {
        bondRequirement = await rocketNodeDeposit.getBondRequirement(activeValidatorCount - 1n);
    }
    const nodeBond = await megapool.getNodeBond();

    // Calculate expected change in bond and capital
    let expectedNodeBondChange = bondRequirement - nodeBond;
    if (expectedNodeBondChange < -'32'.ether) {
        expectedNodeBondChange = -'32'.ether
    }
    const expectedUserCapitalChange = -'32'.ether - expectedNodeBondChange;

    const data1 = await getData();
    await megapool.connect(from).dissolveValidator(0);
    const data2 = await getData();

    const deltas = {
        nodeEthBonded: data2.nodeEthBonded - data1.nodeEthBonded,
        nodeEthBorrowed: data2.nodeEthBorrowed - data1.nodeEthBorrowed,
        nodeMegapoolEthBonded: data2.nodeMegapoolEthBonded - data1.nodeMegapoolEthBonded,
        nodeMegapoolEthBorrowed:data2.nodeMegapoolEthBorrowed - data1.nodeMegapoolEthBorrowed,
        nodeBond:data2.nodeBond - data1.nodeBond,
        userCapital: data2.userCapital - data1.userCapital,
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
}