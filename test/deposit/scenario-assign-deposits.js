import { RocketDepositPool, RocketDAOProtocolSettingsDeposit, RocketMinipoolQueue, RocketDAOProtocolSettingsMinipool, RocketVault } from '../_utils/artifacts';


// Assign deposits to minipools
export async function assignDeposits(txOptions) {

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
        fullMinipoolQueueLength, halfMinipoolQueueLength, emptyMinipoolQueueLength,
        fullDepositUserAmount, halfDepositUserAmount, emptyDepositUserAmount,
    ] = await Promise.all([
        rocketDepositPool.getBalance.call(),
        rocketDAOProtocolSettingsDeposit.getMaximumDepositAssignments.call(),
        rocketMinipoolQueue.getLength.call(1), rocketMinipoolQueue.getLength.call(2), rocketMinipoolQueue.getLength.call(3),
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
    let depositBalanceRemaining = depositPoolBalance;
    let depositAssignmentsRemaining = maxDepositAssignments;
    while (minipoolCapacities.length > 0 && depositBalanceRemaining.gte(minipoolCapacities[0]) && depositAssignmentsRemaining > 0) {
        let capacity = minipoolCapacities.shift();
        ++expectedDepositAssignments;
        expectedEthAssigned = expectedEthAssigned.add(capacity);
        depositBalanceRemaining = depositBalanceRemaining.sub(capacity);
        --depositAssignmentsRemaining;
    }

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketDepositPool.getBalance.call(),
            web3.eth.getBalance(rocketVault.address).then(value => web3.utils.toBN(value)),
        ]).then(
            ([depositPoolEth, vaultEth]) =>
            ({depositPoolEth, vaultEth})
        );
    }

    // Get minipool queue details
    function getMinipoolQueueDetails() {
        return Promise.all([
            rocketMinipoolQueue.getTotalLength.call(),
        ]).then(
            ([totalLength]) =>
            ({totalLength})
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
    assert(balances2.vaultEth.eq(balances1.vaultEth.sub(expectedEthAssigned)), 'Incorrect updated vault ETH balance');

    // Check minipool queues
    assert(queue2.totalLength.eq(queue1.totalLength.sub(web3.utils.toBN(expectedDepositAssignments))), 'Incorrect updated minipool queue length');

}

