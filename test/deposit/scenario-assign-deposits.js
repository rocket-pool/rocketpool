import { RocketDepositPool, RocketDepositSettings, RocketMinipoolQueue, RocketMinipoolSettings, RocketVault } from '../_utils/artifacts';


// Assign deposits to minipools
export async function assignDeposits(txOptions) {

    // Load contracts
    const [
        rocketDepositPool,
        rocketDepositSettings,
        rocketMinipoolQueue,
        rocketMinipoolSettings,
        rocketVault,
    ] = await Promise.all([
        RocketDepositPool.deployed(),
        RocketDepositSettings.deployed(),
        RocketMinipoolQueue.deployed(),
        RocketMinipoolSettings.deployed(),
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
        rocketDepositSettings.getMaximumDepositAssignments.call(),
        rocketMinipoolQueue.getLength.call(1), rocketMinipoolQueue.getLength.call(2), rocketMinipoolQueue.getLength.call(3),
        rocketMinipoolSettings.getDepositUserAmount(1), rocketMinipoolSettings.getDepositUserAmount(2), rocketMinipoolSettings.getDepositUserAmount(3),
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
            web3.eth.getBalance(rocketVault.address),
        ]).then(
            ([depositPoolEth, vaultEth]) =>
            ({depositPoolEth, vaultEth: web3.utils.toBN(vaultEth)})
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
    assert(balances2.vaultEth.eq(balances1.vaultEth.sub(expectedEthAssigned)), 'Incorrect updated vault ETH balance');

    // Check minipool queues
    assert(queue2.totalLength.eq(queue1.totalLength.sub(web3.utils.toBN(expectedDepositAssignments))), 'Incorrect updated minipool queue length');
    assert(queue2.totalCapacity.eq(queue1.totalCapacity.sub(expectedEthAssigned)), 'Incorrect updated minipool queue capacity');

}

