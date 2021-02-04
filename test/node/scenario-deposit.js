import { RocketMinipool, RocketMinipoolManager, RocketNodeDeposit } from '../_utils/artifacts';
import { getTxContractEvents } from '../_utils/contract';


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
            rocketMinipoolManager.getUnprocessedMinipoolCount.call(),
            rocketMinipoolManager.getNodeMinipoolCount.call(nodeAddress),
        ]).then(
            ([network, unprocessed, node]) =>
            ({network, unprocessed, node})
        );
    }

    // Get minipool details
    function getMinipoolDetails(minipoolAddress) {
        return RocketMinipool.at(minipoolAddress).then(minipool => Promise.all([
            rocketMinipoolManager.getMinipoolExists.call(minipoolAddress),
            minipool.getNodeAddress.call(),
            minipool.getNodeDepositBalance.call(),
            minipool.getNodeDepositAssigned.call(),
        ])).then(
            ([exists, nodeAddress, nodeDepositBalance, nodeDepositAssigned]) =>
            ({exists, nodeAddress, nodeDepositBalance, nodeDepositAssigned})
        );
    }

    // Get initial minipool indexes
    let minipoolCounts1 = await getMinipoolCounts(txOptions.from);

    // Deposit
    let txReceipt = await rocketNodeDeposit.deposit(minimumNodeFee, txOptions);

    // Get minipool created events
    let minipoolCreatedEvents = getTxContractEvents(txReceipt, rocketMinipoolManager.address, 'MinipoolCreated', [
        {type: 'address', name: 'minipool', indexed: true},
        {type: 'address', name: 'node', indexed: true},
        {type: 'uint256', name: 'created'},
    ]);

    // Get created minipool
    assert(minipoolCreatedEvents.length == 1, 'Minipool created event not logged');
    let minipoolAddress = minipoolCreatedEvents[0].minipool;

    // Get updated minipool indexes & created minipool details
    let minipoolCounts2 = await getMinipoolCounts(txOptions.from);
    let [
        lastMinipoolAddress,
        lastUnprocessedMinipoolAddress,
        lastNodeMinipoolAddress,
        minipoolDetails,
    ] = await Promise.all([
        rocketMinipoolManager.getMinipoolAt.call(minipoolCounts2.network.sub(web3.utils.toBN(1))),
        rocketMinipoolManager.getUnprocessedMinipoolAt.call(minipoolCounts2.unprocessed.sub(web3.utils.toBN(1))),
        rocketMinipoolManager.getNodeMinipoolAt.call(txOptions.from, minipoolCounts2.node.sub(web3.utils.toBN(1))),
        getMinipoolDetails(minipoolAddress),
    ]);

    // Check minipool indexes
    assert(minipoolCounts2.network.eq(minipoolCounts1.network.add(web3.utils.toBN(1))), 'Incorrect updated network minipool count');
    assert.equal(lastMinipoolAddress, minipoolAddress, 'Incorrect updated network minipool index');
    assert(minipoolCounts2.unprocessed.eq(minipoolCounts1.unprocessed.add(web3.utils.toBN(1))), 'Incorrect updated unprocessed minipool count');
    assert.equal(lastUnprocessedMinipoolAddress, minipoolAddress, 'Incorrect updated unprocessed minipool index');
    assert(minipoolCounts2.node.eq(minipoolCounts1.node.add(web3.utils.toBN(1))), 'Incorrect updated node minipool count');
    assert.equal(lastNodeMinipoolAddress, minipoolAddress, 'Incorrect updated node minipool index');

    // Check minipool details
    assert.isTrue(minipoolDetails.exists, 'Incorrect created minipool exists status');
    assert.equal(minipoolDetails.nodeAddress, txOptions.from, 'Incorrect created minipool node address');
    assert(minipoolDetails.nodeDepositBalance.eq(txOptions.value), 'Incorrect created minipool node deposit balance');
    assert.isTrue(minipoolDetails.nodeDepositAssigned, 'Incorrect created minipool node deposit assigned status');

}

