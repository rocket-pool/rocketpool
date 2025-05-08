// Reduce bond
import { RocketNodeStaking } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

export async function reduceBond(megapool, amount) {
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

    const data1 = await getData();
    await megapool.reduceBond(amount);
    const data2 = await getData();

    const nodeEthBondedDelta = data2.nodeEthBonded - data1.nodeEthBonded;
    const nodeEthBorrowedDelta = data2.nodeEthBorrowed - data1.nodeEthBorrowed;
    const nodeMegapoolEthBondedDelta = data2.nodeMegapoolEthBonded - data1.nodeMegapoolEthBonded;
    const nodeMegapoolEthBorrowedDelta = data2.nodeMegapoolEthBorrowed - data1.nodeMegapoolEthBorrowed;
    const nodeBondDelta = data2.nodeBond - data1.nodeBond;
    const userCapitalDelta = data2.userCapital - data1.userCapital;

    assertBN.equal(nodeBondDelta, -amount);
    assertBN.equal(userCapitalDelta, amount);

    assertBN.equal(nodeEthBondedDelta, -amount);
    assertBN.equal(nodeEthBorrowedDelta, amount);
    assertBN.equal(nodeMegapoolEthBondedDelta, -amount);
    assertBN.equal(nodeMegapoolEthBorrowedDelta, amount);
}
