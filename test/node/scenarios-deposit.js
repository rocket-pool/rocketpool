import { RocketMinipoolManager, RocketNodeDeposit } from '../_utils/artifacts';


// Make a node deposit
export async function deposit(minimumNodeFee, txOptions) {

    // Load contracts
    const [
        rocketMinipoolManager,
        rocketNodeDeposit,
    ] = await Promise.all([
        RocketMinipoolManager.deployed(),
        RocketNodeDeposit.deployed(),
    ]);

    // Get minipool counts
    function getMinipoolCounts(nodeAddress) {
        return Promise.all([
            rocketMinipoolManager.getMinipoolCount.call(),
            rocketMinipoolManager.getNodeMinipoolCount.call(nodeAddress),
        ]).then(
            ([network, node]) =>
            ({network, node})
        );
    }

    // Get initial minipool counts
    let minipoolCounts1 = await getMinipoolCounts(txOptions.from);

    // Deposit
    await rocketNodeDeposit.deposit(minimumNodeFee, txOptions);

    // Get updated minipool counts
    let minipoolCounts2 = await getMinipoolCounts(txOptions.from);

    // Check minipool counts
    assert(minipoolCounts2.network.eq(minipoolCounts1.network.add(web3.utils.toBN(1))), 'Incorrect updated network minipool count');
    assert(minipoolCounts2.node.eq(minipoolCounts1.node.add(web3.utils.toBN(1))), 'Incorrect updated node minipool count');

}

