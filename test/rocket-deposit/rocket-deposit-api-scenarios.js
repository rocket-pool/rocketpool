// Dependencies
import { getTransactionContractEvents } from '../_lib/utils/general';
import { profileGasUsage } from '../_lib/utils/profiling';
import { RocketDepositAPI, RocketDepositQueue, RocketDepositSettings, RocketMinipoolInterface, RocketMinipoolSettings, RocketPool } from '../_lib/artifacts';


// Get all available minipools
async function getAvailableMinipools() {
    const rocketPool = await RocketPool.deployed();

    // Get minipool count
    let minipoolCount = parseInt(await rocketPool.getPoolsCount.call());

    // Get available minipools
    let mi, minipoolAddress, minipool, status, availableMinipools = [];
    for (mi = 0; mi < minipoolCount; ++mi) {
        minipoolAddress = await rocketPool.getPoolAt.call(mi);
        minipool = await RocketMinipoolInterface.at(minipoolAddress);
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
export async function scenarioDeposit({depositorContract, durationID, fromAddress, value, gas}) {
    const rocketDepositQueue = await RocketDepositQueue.deployed();
    const rocketDepositSettings = await RocketDepositSettings.deployed();

    // Get deposit settings
    let chunkSize = parseInt(await rocketDepositSettings.getDepositChunkSize.call());
    let maxChunkAssignments = parseInt(await rocketDepositSettings.getChunkAssignMax.call());

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

    // Deposit
    let result = await depositorContract.deposit(durationID, {from: fromAddress, value: value, gas: gas});
    profileGasUsage('RocketGroupAccessorContract.deposit', result);

    // Get updated minipool balances
    let minipoolBalances2 = await getMinipoolBalances(availableMinipools);

    // Get chunk fragment assignment events
    let chunkFragmentAssignEvents = getTransactionContractEvents(result, rocketDepositQueue.address, 'DepositChunkFragmentAssign', [
        {type: 'bytes32', name: '_depositID', indexed: true},
        {type: 'address', name: '_minipoolAddress', indexed: true},
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

    // Check assigned minipool balances
    for (let address in minipoolEtherAssigned) {
        let amount = minipoolEtherAssigned[address];
        assert.equal(minipoolBalances2[address], minipoolBalances1[address] + amount, 'Assigned minipool balance was not updated correctly');
    }

}


// Request a deposit refund
export async function scenarioRefundDeposit({depositorContract, durationID, depositID, fromAddress, gas}) {

	// Request refund
	let result = await depositorContract.refundDeposit(durationID, depositID, {from: fromAddress, gas: gas});

	// TODO:
	// - check balance of deposit queue
	// - check length of deposit queue
	// - check balance of fromAddress

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
