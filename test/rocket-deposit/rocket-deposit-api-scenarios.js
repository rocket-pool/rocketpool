// Dependencies
import { getTransactionContractEvents } from '../_lib/utils/general';
import { ValidatorStatus } from '../_lib/utils/beacon';
import { profileGasUsage } from '../_lib/utils/profiling';
import { RocketDepositAPI, RocketDepositQueue, RocketDepositSettings, RocketMinipool, RocketMinipoolSettings, RocketPool } from '../_lib/artifacts';


// Get all available minipools
async function getAvailableMinipools() {
    const rocketPool = await RocketPool.deployed();

    // Get minipool count
    let minipoolCount = parseInt(await rocketPool.getPoolsCount.call());

    // Get available minipools
    let mi, minipoolAddress, minipool, status, availableMinipools = [];
    for (mi = 0; mi < minipoolCount; ++mi) {
        minipoolAddress = await rocketPool.getPoolAt.call(mi);
        minipool = await RocketMinipool.at(minipoolAddress);
        status = parseInt(await minipool.getStatus.call());
        if (status == 0 || status == 1) availableMinipools.push(minipool);
    }

    // Return
    return availableMinipools;

}


// Get total minipool deposit capacity
async function getTotalMinipoolCapacity(minipools) {
    const rocketMinipoolSettings = await RocketMinipoolSettings.deployed();

    // Get minipool launch amount
    let launchAmount = parseInt(await rocketMinipoolSettings.getMinipoolLaunchAmount.call());

    // Get capacity
    let mi, balance, capacity = 0;
    for (mi = 0; mi < minipools.length; ++mi) {
        balance = parseInt(await web3.eth.getBalance(minipools[mi].address));
        capacity += (launchAmount - balance);
    }

    // Return
    return capacity;

}


// Get minipool balances
async function getMinipoolBalances(minipools) {

    // Get balances
    let mi, address, balances = {};
    for (mi = 0; mi < minipools.length; ++mi) {
        address = minipools[mi].address;
        balances[address.toLowerCase()] = parseInt(await web3.eth.getBalance(address));
    }

    // Return
    return balances;

}


// Make a deposit
export async function scenarioDeposit({beaconChain, depositorContract, durationID, fromAddress, value, gas}) {
    const rocketDepositQueue = await RocketDepositQueue.deployed();
    const rocketDepositSettings = await RocketDepositSettings.deployed();
    const rocketMinipoolSettings = await RocketMinipoolSettings.deployed();

    // Get deposit & minipool settings
    let chunkSize = parseInt(await rocketDepositSettings.getDepositChunkSize.call());
    let maxChunkAssignments = parseInt(await rocketDepositSettings.getChunkAssignMax.call());
    let launchAmount = parseInt(await rocketMinipoolSettings.getMinipoolLaunchAmount.call());

    // Get current and expected queue balance
    let queueBalance = parseInt(await rocketDepositQueue.getBalance(durationID));
    let newQueueBalance = queueBalance + parseInt(value);

    // Get available minipools and deposit capacity
    let availableMinipools = await getAvailableMinipools();
    let minipoolCapacity = await getTotalMinipoolCapacity(availableMinipools);

    // Get expected number of chunk assignments
    let expectedChunkAssignments = Math.min(maxChunkAssignments, Math.floor(Math.min(newQueueBalance, minipoolCapacity) / chunkSize));

    // Get initial minipool balances
    let minipoolBalances1 = await getMinipoolBalances(availableMinipools);

    // Get initial beacon chain validators
    let validators1 = beaconChain.getValidatorsByStatus(ValidatorStatus.ACTIVE);

    // Deposit
    let result = await depositorContract.deposit(durationID, {from: fromAddress, value: value, gas: gas});
    profileGasUsage('RocketGroupAccessorContract.deposit', result);

    // Get updated minipool balances
    let minipoolBalances2 = await getMinipoolBalances(availableMinipools);

    // Get updated beacon chain validators
    let validators2 = beaconChain.getValidatorsByStatus(ValidatorStatus.ACTIVE);

    // Get chunk fragment assignment events
    let chunkFragmentAssignEvents = getTransactionContractEvents(result, rocketDepositQueue.address, 'DepositChunkFragmentAssign', [
        {type: 'address', name: '_minipoolAddress', indexed: true},
        {type: 'bytes32', name: '_depositID', indexed: true},
        {type: 'address', name: 'userID'},
        {type: 'address', name: 'groupID'},
        {type: 'uint256', name: 'value'},
        {type: 'uint256', name: 'created'},
    ]);

    // Get total ether assigned in chunk fragments
    let etherAssigned = chunkFragmentAssignEvents.reduce((acc, val) => (acc + parseInt(val.value)), 0);

    // Get total ether assigned in chunk fragments per minipool
    let minipoolEtherAssigned = {};
    chunkFragmentAssignEvents.forEach(event => {
        let address = event._minipoolAddress.toLowerCase();
        if (minipoolEtherAssigned[address] === undefined) minipoolEtherAssigned[address] = 0;
        minipoolEtherAssigned[address] += parseInt(event.value);
    });

    // Check total ether assigned
    assert.equal(etherAssigned, chunkSize * expectedChunkAssignments, 'Expected number of chunk assignments not performed');

    // Check assigned minipools
    for (let address in minipoolEtherAssigned) {
        let amount = minipoolEtherAssigned[address];

        // Get expected minipool balance
        let expectedBalance = minipoolBalances1[address] + amount;

        // Minipool launching
        if (expectedBalance >= launchAmount) {
            expectedBalance = 0;

            // Check active validator set on beacon chain
            assert.equal(validators1.filter(validator => validator.withdrawalAddress.toLowerCase() == address.toLowerCase()).length, 0, 'Validator existed for minipool before launch');
            assert.equal(validators2.filter(validator => validator.withdrawalAddress.toLowerCase() == address.toLowerCase()).length, 1, 'Validator was not added for launched minipool');

        }

        // Check minipool balance
        assert.equal(minipoolBalances2[address], expectedBalance, 'Assigned minipool balance was not updated correctly');

    }

    // Check assigned users
    for (let i = 0; i < chunkFragmentAssignEvents.length; ++i) {

        // Get details & minipool
        let userAddress = chunkFragmentAssignEvents[i].userID;
        let minipoolAddress = chunkFragmentAssignEvents[i]._minipoolAddress;
        let minipool = await RocketMinipool.at(minipoolAddress);

        // Get minipool user details
        let userExists = await minipool.getUserExists.call(userAddress);
        let userHasDeposit = await minipool.getUserHasDeposit.call(userAddress);
        let userDepositTokens = parseInt(await minipool.getUserDepositTokens.call(userAddress));

        // Asserts
        assert.isTrue(userExists, 'Incorrect minipool user exists status');
        assert.isTrue(userHasDeposit, 'Incorrect minipool user deposit status');
        assert.equal(userDepositTokens, 0, 'Incorrect minipool user deposit token count');

    }

}


// Request a deposit refund
export async function scenarioRefundDeposit({depositorContract, groupID, durationID, depositID, fromAddress, gas}) {
    const rocketDepositAPI = await RocketDepositAPI.deployed();
    const rocketDepositQueue = await RocketDepositQueue.deployed();

    // Get initial from address balance
    let fromBalance1 = parseInt(await web3.eth.getBalance(fromAddress));

    // Get initial queue status
    let depositCount1 = parseInt(await rocketDepositAPI.getUserQueuedDepositCount.call(groupID, fromAddress, durationID));
    let depositBalance1 = parseInt(await rocketDepositAPI.getUserQueuedDepositBalance.call(depositID));
    let queueBalance1 = parseInt(await rocketDepositQueue.getBalance.call(durationID));

    // Request refund
    let result = await depositorContract.refundDeposit(durationID, depositID, {from: fromAddress, gas: gas});

    // Get updated from address balance
    let fromBalance2 = parseInt(await web3.eth.getBalance(fromAddress));

    // Get updated queue status
    let depositCount2 = parseInt(await rocketDepositAPI.getUserQueuedDepositCount.call(groupID, fromAddress, durationID));
    let depositBalance2 = parseInt(await rocketDepositAPI.getUserQueuedDepositBalance.call(depositID));
    let queueBalance2 = parseInt(await rocketDepositQueue.getBalance.call(durationID));

    // Asserts
    assert.isTrue(fromBalance2 > fromBalance1, 'From address balance was not increased');
    assert.equal(depositCount2, depositCount1 - 1, 'User deposit count was not decremented');
    assert.equal(depositBalance2, 0, 'Queued deposit balance was not set to 0');
    assert.equal(queueBalance2, queueBalance1 - depositBalance1, 'Deposit queue balance was not decreased by deposit amount');

}


// Withdraw deposit from a minipool
export async function scenarioWithdrawMinipoolDeposit({withdrawerContract, depositID, minipoolAddress, fromAddress, gas}) {
    const minipool = await RocketMinipool.at(minipoolAddress);

    // Get initial balances
    let minipoolBalance1 = parseInt(await web3.eth.getBalance(minipoolAddress));
    let userBalance1 = parseInt(await web3.eth.getBalance(fromAddress));

    // Get initial minipool user status
    let userCount1 = parseInt(await minipool.getUserCount.call());
    let userExists1 = await minipool.getUserExists.call(fromAddress);
    let userDeposit1 = parseInt(await minipool.getUserDeposit.call(fromAddress));

    // Withdraw
    let result = await withdrawerContract.withdrawMinipoolDeposit(depositID, minipoolAddress, {from: fromAddress, gas: gas});

    // Get updated balances
    let minipoolBalance2 = parseInt(await web3.eth.getBalance(minipoolAddress));
    let userBalance2 = parseInt(await web3.eth.getBalance(fromAddress));

    // Get updated minipool user status
    let userCount2 = parseInt(await minipool.getUserCount.call());
    let userExists2 = await minipool.getUserExists.call(fromAddress);

    // Asserts
    assert.equal(userCount2, userCount1 - 1, 'Minipool user count was not updated correctly');
    assert.equal(userExists1, true, 'Initial minipool user exists check incorrect');
    assert.equal(userExists2, false, 'Second minipool user exists check incorrect');
    assert.isTrue(userDeposit1 > 0, 'Initial user deposit check incorrect');
    assert.equal(minipoolBalance2, minipoolBalance1 - userDeposit1, 'Minipool balance was not updated correctly');
    assert.isTrue(userBalance2 > userBalance1, 'User balance was not updated correctly');

}


// Attempt a deposit via the deposit API
export async function scenarioAPIDeposit({groupID, userID, durationID, fromAddress, value, gas}) {
    const rocketDepositAPI = await RocketDepositAPI.deployed();

    // Deposit
    await rocketDepositAPI.deposit(groupID, userID, durationID, {from: fromAddress, value: value, gas: gas});

}


// Attempt a deposit refund via the deposit API
export async function scenarioAPIRefundDeposit({groupID, userID, durationID, depositID, fromAddress, gas}) {
    const rocketDepositAPI = await RocketDepositAPI.deployed();

    // Request refund
    await rocketDepositAPI.refundDeposit(groupID, userID, durationID, depositID, {from: fromAddress, gas: gas});

}

// Attempt a minipool deposit withdrawal via the deposit API
export async function scenarioAPIWithdrawMinipoolDeposit({groupID, userID, depositID, minipoolAddress, fromAddress, gas}) {
    const rocketDepositAPI = await RocketDepositAPI.deployed();

    // Withdraw
    await rocketDepositAPI.withdrawMinipoolDeposit(groupID, userID, depositID, minipoolAddress, {from: fromAddress, gas: gas});

}

