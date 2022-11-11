import {
    RocketDepositPool,
    RocketDAOProtocolSettingsDeposit,
    RocketMinipoolQueue,
    RocketDAOProtocolSettingsMinipool,
    RocketVault,
    RocketMinipoolDelegate,
} from '../_utils/artifacts';


// Assign deposits to minipools
export async function assignDepositsV2(txOptions) {

    // Load contracts
    const [
        rocketDepositPool,
        rocketDAOProtocolSettingsDeposit,
        rocketMinipoolQueue,
        rocketDAOProtocolSettingsMinipool,
        rocketVault,
    ] = await Promise.all([
        RocketDepositPool.deployed(),
        RocketDAOProtocolSettingsDeposit.deployed(),
        RocketMinipoolQueue.deployed(),
        RocketDAOProtocolSettingsMinipool.deployed(),
        RocketVault.deployed(),
    ]);

    // Get parameters
    let [
        depositPoolBalance,
        maxDepositAssignments,
        maxSocialisedAssignments,
        minipoolQueueLength,
        fullMinipoolQueueLength, halfMinipoolQueueLength, emptyMinipoolQueueLength,
        fullDepositUserAmount, halfDepositUserAmount, emptyDepositUserAmount,
    ] = await Promise.all([
        rocketVault.balanceOf.call("rocketDepositPool"),
        rocketDAOProtocolSettingsDeposit.getMaximumDepositAssignments.call(),
        rocketDAOProtocolSettingsDeposit.getMaximumDepositSocialisedAssignments.call(),
        rocketMinipoolQueue.getLength.call(),
        rocketMinipoolQueue.getLengthLegacy.call(1), rocketMinipoolQueue.getLengthLegacy.call(2), rocketMinipoolQueue.getLengthLegacy.call(3),
        rocketDAOProtocolSettingsMinipool.getDepositUserAmount(1), rocketDAOProtocolSettingsMinipool.getDepositUserAmount(2), rocketDAOProtocolSettingsMinipool.getDepositUserAmount(3),
    ]);

    // Get queued minipool capacities
    let minipoolCapacities = [];
    for (let i = 0; i < halfMinipoolQueueLength; ++i)  minipoolCapacities.push(halfDepositUserAmount);
    for (let i = 0; i < fullMinipoolQueueLength; ++i)  minipoolCapacities.push(fullDepositUserAmount);
    for (let i = 0; i < emptyMinipoolQueueLength; ++i) minipoolCapacities.push(emptyDepositUserAmount);

    // Get expected deposit assignment parameters
    let expectedDepositAssignments = 0;
    let expectedEthAssigned = web3.utils.toBN(0);
    let expectedNodeBalanceUsed = web3.utils.toBN(0);
    let depositBalanceRemaining = depositPoolBalance;
    let depositAssignmentsRemaining = maxDepositAssignments;

    while (minipoolCapacities.length > 0 && depositBalanceRemaining.gte(minipoolCapacities[0]) && depositAssignmentsRemaining > 0) {
        let capacity = minipoolCapacities.shift();
        ++expectedDepositAssignments;
        expectedEthAssigned = expectedEthAssigned.add(capacity);
        depositBalanceRemaining = depositBalanceRemaining.sub(capacity);
        --depositAssignmentsRemaining;
    }

    // No legacy deposits
    if (expectedDepositAssignments === 0) {
        let scalingCount = maxSocialisedAssignments.toNumber();
        let totalEthCount = depositPoolBalance.div(web3.utils.toBN(web3.utils.toWei('31', 'ether'))).toNumber();
        expectedDepositAssignments = Math.min(scalingCount, totalEthCount, maxDepositAssignments.toNumber(), minipoolQueueLength.toNumber());
        expectedEthAssigned = web3.utils.toBN(web3.utils.toWei('31', 'ether')).mul(web3.utils.toBN(expectedDepositAssignments));

        let indices = [...Array(expectedDepositAssignments).keys()];
        let addressesInQueue = await Promise.all(indices.map(i => rocketMinipoolQueue.getMinipoolAt(i)));
        let minipoolsInQueue = await Promise.all(addressesInQueue.map(a => RocketMinipoolDelegate.at(a)));
        let topUpValues = await Promise.all(minipoolsInQueue.map(m => m.getNodeTopUpValue()))
        expectedNodeBalanceUsed = topUpValues.reduce((p, c) => p.add(c), expectedNodeBalanceUsed);
    }

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketDepositPool.getBalance.call(),
            rocketDepositPool.getNodeBalance.call(),
            web3.eth.getBalance(rocketVault.address).then(value => web3.utils.toBN(value)),
        ]).then(
            ([depositPoolEth, depositPoolNodeEth, vaultEth]) =>
            ({depositPoolEth, depositPoolNodeEth, vaultEth})
        );
    }

    // Get minipool queue details
    function getMinipoolQueueDetails() {
        return Promise.all([
            rocketMinipoolQueue.getTotalLength.call(),
            rocketMinipoolQueue.getTotalCapacity.call(),
        ]).then(
            ([totalLength, totalCapacity]) =>
            ({totalLength, totalCapacity})
        );
    }

    // Get initial balances & minipool queue details
    let [balances1, queue1] = await Promise.all([
        getBalances(),
        getMinipoolQueueDetails(),
    ]);

    // Assign deposits
    await rocketDepositPool.assignDeposits(txOptions);

    // Get updated balances & minipool queue details
    let [balances2, queue2] = await Promise.all([
        getBalances(),
        getMinipoolQueueDetails(),
    ]);

    // Check balances
    assert(balances2.depositPoolEth.eq(balances1.depositPoolEth.sub(expectedEthAssigned)), 'Incorrect updated deposit pool ETH balance');
    assert(balances2.depositPoolNodeEth.eq(balances1.depositPoolNodeEth.sub(expectedNodeBalanceUsed)), 'Incorrect updated deposit pool node ETH balance');
    assert(balances2.vaultEth.eq(balances1.vaultEth.sub(expectedEthAssigned)), 'Incorrect updated vault ETH balance');

    // Check minipool queues
    assert(queue2.totalLength.eq(queue1.totalLength.sub(web3.utils.toBN(expectedDepositAssignments))), 'Incorrect updated minipool queue length');
    assert(queue2.totalCapacity.eq(queue1.totalCapacity.sub(expectedEthAssigned)), 'Incorrect updated minipool queue capacity');

}

