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
            rocketNodeStaking.getNodeETHMatched(nodeAddress),
            rocketNodeStaking.getNodeETHProvided(nodeAddress),
            rocketNodeStaking.getNodeMegapoolETHMatched(nodeAddress),
            rocketNodeStaking.getNodeMegapoolETHProvided(nodeAddress),
            megapool.getNodeBond(),
            megapool.getUserCapital(),
        ]).then(
            ([nodeEthMatched, nodeEthProvided, nodeMegapoolEthMatched, nodeMegapoolEthProvided, nodeBond, userCapital]) =>
                ({ nodeEthMatched, nodeEthProvided, nodeMegapoolEthMatched, nodeMegapoolEthProvided, nodeBond, userCapital }),
        );
    }

    const data1 = await getData();
    await megapool.reduceBond(amount);
    const data2 = await getData();

    const nodeEthProvidedDelta = data2.nodeEthProvided - data1.nodeEthProvided;
    const nodeEthMatchedDelta = data2.nodeEthMatched - data1.nodeEthMatched;
    const nodeMegapoolEthProvidedDelta = data2.nodeMegapoolEthProvided - data1.nodeMegapoolEthProvided;
    const nodeMegapoolEthMatchedDelta = data2.nodeMegapoolEthMatched - data1.nodeMegapoolEthMatched;
    const nodeBondDelta = data2.nodeBond - data1.nodeBond;
    const userCapitalDelta = data2.userCapital - data1.userCapital;

    assertBN.equal(nodeBondDelta, -amount);
    assertBN.equal(userCapitalDelta, amount);

    assertBN.equal(nodeEthProvidedDelta, amount);
    assertBN.equal(nodeEthMatchedDelta, -amount);
    assertBN.equal(nodeMegapoolEthProvidedDelta, amount);
    assertBN.equal(nodeMegapoolEthMatchedDelta, -amount);
}
