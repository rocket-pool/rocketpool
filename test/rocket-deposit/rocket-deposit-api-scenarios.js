// Dependencies
import { getTransactionContractEvents } from '../_lib/utils/general';
import { deserialiseDepositInput, getValidatorStatus } from '../_lib/utils/beacon';
import { profileGasUsage } from '../_lib/utils/profiling';
import { RocketBETHToken, RocketDepositAPI, RocketDepositIndex, RocketDepositQueue, RocketDepositSettings, RocketGroupContract, RocketMinipool, RocketMinipoolSettings, RocketNodeContract, RocketPool } from '../_lib/artifacts';


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
export async function scenarioDeposit({depositorContract, durationID, fromAddress, value, gas}) {
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

    // Deposit
    let result = await depositorContract.deposit(durationID, {from: fromAddress, value: value, gas: gas});
    profileGasUsage('RocketGroupAccessorContract.deposit', result);

    // Get updated minipool balances
    let minipoolBalances2 = await getMinipoolBalances(availableMinipools);

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

            // Extract minipool's validator pubkey from deposit input data
            let minipool = await RocketMinipool.at(address);
            let depositInput = deserialiseDepositInput(await minipool.getDepositInput.call());

            // Check for validator on beacon chain
            let validatorExists = true;
            try { await getValidatorStatus(depositInput.pubkey); }
            catch (e) { validatorExists = false; }
            assert.isTrue(validatorExists, 'Launched minipool validator does not exist on beacon chain');

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
        let groupID = await depositorContract.groupID.call();
        let userExists = await minipool.getUserExists.call(userAddress, groupID);
        let userHasDeposit = await minipool.getUserHasDeposit.call(userAddress, groupID);
        let userStakingTokensWithdrawn = parseInt(await minipool.getUserStakingTokensWithdrawn.call(userAddress, groupID));

        // Asserts
        assert.isTrue(userExists, 'Incorrect minipool user exists status');
        assert.isTrue(userHasDeposit, 'Incorrect minipool user deposit status');
        assert.equal(userStakingTokensWithdrawn, 0, 'Incorrect minipool user staking tokens withdrawn count');

    }

}


// Request a refund from a queued deposit
export async function scenarioRefundQueuedDeposit({depositorContract, groupID, durationID, depositID, fromAddress, gas}) {
    const rocketDepositIndex = await RocketDepositIndex.deployed();
    const rocketDepositQueue = await RocketDepositQueue.deployed();

    // Get initial from address balance
    let fromBalance1 = parseInt(await web3.eth.getBalance(fromAddress));

    // Get initial queue status
    let depositCount1 = parseInt(await rocketDepositIndex.getUserQueuedDepositCount.call(groupID, fromAddress, durationID));
    let depositBalance1 = parseInt(await rocketDepositIndex.getUserDepositQueuedAmount.call(depositID));
    let queueBalance1 = parseInt(await rocketDepositQueue.getBalance.call(durationID));

    // Request refund
    let result = await depositorContract.refundDepositQueued(durationID, depositID, {from: fromAddress, gas: gas});

    // Get updated from address balance
    let fromBalance2 = parseInt(await web3.eth.getBalance(fromAddress));

    // Get updated queue status
    let depositCount2 = parseInt(await rocketDepositIndex.getUserQueuedDepositCount.call(groupID, fromAddress, durationID));
    let depositBalance2 = parseInt(await rocketDepositIndex.getUserDepositQueuedAmount.call(depositID));
    let queueBalance2 = parseInt(await rocketDepositQueue.getBalance.call(durationID));

    // Asserts
    assert.isTrue(fromBalance2 > fromBalance1, 'From address balance was not increased');
    assert.equal(depositCount2, depositCount1 - 1, 'User deposit count was not decremented');
    assert.equal(depositBalance2, 0, 'Queued deposit balance was not set to 0');
    assert.equal(queueBalance2, queueBalance1 - depositBalance1, 'Deposit queue balance was not decreased by deposit amount');

}


// Request a refund from a stalled minipool
export async function scenarioRefundStalledMinipoolDeposit({depositorContract, depositID, minipoolAddress, fromAddress, gas}) {
    const minipool = await RocketMinipool.at(minipoolAddress);

    // Get group ID
    let groupID = await depositorContract.groupID.call();

    // Get initial balances
    let minipoolBalance1 = parseInt(await web3.eth.getBalance(minipoolAddress));
    let userBalance1 = parseInt(await web3.eth.getBalance(fromAddress));

    // Get initial minipool user status
    let userCount1 = parseInt(await minipool.getUserCount.call());
    let userExists1 = await minipool.getUserExists.call(fromAddress, groupID);
    let userDeposit1 = parseInt(await minipool.getUserDeposit.call(fromAddress, groupID));

    // Refund
    let result = await depositorContract.refundDepositMinipoolStalled(depositID, minipoolAddress, {from: fromAddress, gas: gas});
    profileGasUsage('RocketGroupAccessorContract.refundDepositMinipoolStalled', result);

    // Get updated balances
    let minipoolBalance2 = parseInt(await web3.eth.getBalance(minipoolAddress));
    let userBalance2 = parseInt(await web3.eth.getBalance(fromAddress));

    // Get updated minipool user status
    let userCount2 = parseInt(await minipool.getUserCount.call());
    let userExists2 = await minipool.getUserExists.call(fromAddress, groupID);

    // Asserts
    assert.equal(userCount2, userCount1 - 1, 'Minipool user count was not updated correctly');
    assert.equal(userExists1, true, 'Initial minipool user exists check incorrect');
    assert.equal(userExists2, false, 'Second minipool user exists check incorrect');
    assert.isTrue(userDeposit1 > 0, 'Initial user deposit check incorrect');
    assert.equal(minipoolBalance2, minipoolBalance1 - userDeposit1, 'Minipool balance was not updated correctly');
    assert.isTrue(userBalance2 > userBalance1, 'User balance was not updated correctly');

}


// Withdraw a deposit from a staking minipool
export async function scenarioWithdrawStakingMinipoolDeposit({withdrawerContract, depositID, minipoolAddress, amount, amountInt, fromAddress, gas}) {
    const minipool = await RocketMinipool.at(minipoolAddress);
    const rocketBETHToken = await RocketBETHToken.deployed();

    // Initialise params
    if (amountInt === undefined) amountInt = parseInt(amount);

    // Get group ID
    let groupID = await withdrawerContract.groupID.call();

    // Get initial balances
    let minipoolEthBalance1 = parseInt(await web3.eth.getBalance(minipoolAddress));
    let userRpbBalance1 = parseInt(await rocketBETHToken.balanceOf.call(fromAddress));

    // Get initial minipool user status
    let userCount1 = parseInt(await minipool.getUserCount.call());
    let userExists1 = await minipool.getUserExists.call(fromAddress, groupID);
    let userDeposit1 = parseInt(await minipool.getUserDeposit.call(fromAddress, groupID));
    let userStakingTokensWithdrawn1 = parseInt(await minipool.getUserStakingTokensWithdrawn.call(fromAddress, groupID));

    // Check if the user should be removed
    let expectUserRemoved = (amountInt == userDeposit1);

    // Withdraw
    let result = await withdrawerContract.withdrawDepositMinipoolStaking(depositID, minipoolAddress, amount, {from: fromAddress, gas: gas});
    profileGasUsage('RocketGroupAccessorContract.withdrawDepositMinipoolStaking', result);

    // Get updated balances
    let minipoolEthBalance2 = parseInt(await web3.eth.getBalance(minipoolAddress));
    let userRpbBalance2 = parseInt(await rocketBETHToken.balanceOf.call(fromAddress));

    // Get updated minipool user status
    let userCount2 = parseInt(await minipool.getUserCount.call());
    let userExists2 = await minipool.getUserExists.call(fromAddress, groupID);
    let userDeposit2 = (expectUserRemoved ? 0 : parseInt(await minipool.getUserDeposit.call(fromAddress, groupID)));
    let userStakingTokensWithdrawn2 = (expectUserRemoved ? 0 : parseInt(await minipool.getUserStakingTokensWithdrawn.call(fromAddress, groupID)));

    // Asserts
    assert.equal(userCount2, (expectUserRemoved ? userCount1 - 1 : userCount1), 'Minipool user count was not updated correctly');
    assert.equal(userExists1, true, 'Initial minipool user exists check incorrect');
    assert.equal(userExists2, !expectUserRemoved, 'Second minipool user exists check incorrect');
    assert.isTrue(userDeposit1 > 0, 'Initial user deposit check incorrect');
    assert.equal(userDeposit2, userDeposit1 - amountInt, 'User deposit amount was not updated correctly');
    assert.isTrue((expectUserRemoved ? userStakingTokensWithdrawn2 == 0 : userStakingTokensWithdrawn2 > userStakingTokensWithdrawn1), 'User staking tokens withdrawn was not updated correctly');
    assert.isTrue(userRpbBalance2 > userRpbBalance1, 'User RPB balance was not updated correctly');
    assert.equal(minipoolEthBalance2, minipoolEthBalance1, 'Minipool ether balance changed and should not have');

}


// Withdraw a deposit from a withdrawn minipool
export async function scenarioWithdrawMinipoolDeposit({withdrawerContract, depositID, minipoolAddress, fromAddress, gas}) {
    const minipool = await RocketMinipool.at(minipoolAddress);
    const rocketBETHToken = await RocketBETHToken.deployed();
    const rocketMinipoolSettings = await RocketMinipoolSettings.deployed();

    // Get group ID & contract
    let groupID = await withdrawerContract.groupID.call();
    let groupContract = await RocketGroupContract.at(groupID);

    // Get node contract
    let nodeContractAddress = await minipool.getNodeContract.call();
    let nodeContract = await RocketNodeContract.at(nodeContractAddress);

    // Get RP, node and group fee addresses
    let rpFeeAddress = await rocketMinipoolSettings.getMinipoolWithdrawalFeeDepositAddress.call();
    let nodeFeeAddress = await nodeContract.getRewardsAddress.call();
    let groupFeeAddress = await groupContract.getFeeAddress.call();

    // Get initial balances
    let minipoolEthBalance1 = parseInt(await web3.eth.getBalance(minipoolAddress));
    let minipoolRpbBalance1 = parseInt(await rocketBETHToken.balanceOf.call(minipoolAddress));
    let userRpbBalance1 = parseInt(await rocketBETHToken.balanceOf.call(fromAddress));
    let rpRpbBalance1 = parseInt(await rocketBETHToken.balanceOf.call(rpFeeAddress));
    let nodeRpbBalance1 = parseInt(await rocketBETHToken.balanceOf.call(nodeFeeAddress));
    let groupRpbBalance1 = parseInt(await rocketBETHToken.balanceOf.call(groupFeeAddress));

    // Get initial minipool user status
    let userCount1 = parseInt(await minipool.getUserCount.call());
    let userExists1 = await minipool.getUserExists.call(fromAddress, groupID);
    let userBackupExists1 = await minipool.getUserBackupAddressExists.call(fromAddress, groupID);

    // Withdraw
    let result = await withdrawerContract.withdrawDepositMinipool(depositID, minipoolAddress, {from: fromAddress, gas: gas});
    profileGasUsage('RocketGroupAccessorContract.withdrawDepositMinipool', result);

    // Get updated balances
    let minipoolEthBalance2 = parseInt(await web3.eth.getBalance(minipoolAddress));
    let minipoolRpbBalance2 = parseInt(await rocketBETHToken.balanceOf.call(minipoolAddress));
    let userRpbBalance2 = parseInt(await rocketBETHToken.balanceOf.call(fromAddress));
    let rpRpbBalance2 = parseInt(await rocketBETHToken.balanceOf.call(rpFeeAddress));
    let nodeRpbBalance2 = parseInt(await rocketBETHToken.balanceOf.call(nodeFeeAddress));
    let groupRpbBalance2 = parseInt(await rocketBETHToken.balanceOf.call(groupFeeAddress));

    // Get updated minipool user status
    let userCount2 = parseInt(await minipool.getUserCount.call());
    let userExists2 = await minipool.getUserExists.call(fromAddress, groupID);

    // Get RPB transfer amounts
    let userRpbSent = userRpbBalance2 - userRpbBalance1;
    let rpRpbSent = rpRpbBalance2 - rpRpbBalance1;
    let nodeRpbSent = nodeRpbBalance2 - nodeRpbBalance1;
    let groupRpbSent = groupRpbBalance2 - groupRpbBalance1;
    let totalRpbSent = userRpbSent + rpRpbSent + nodeRpbSent + groupRpbSent;

    // Asserts
    assert.equal(userCount2, userCount1 - 1, 'Minipool user count was not updated correctly');
    assert.equal(userExists1 || userBackupExists1, true, 'Initial minipool user exists check incorrect');
    assert.equal(userExists2, false, 'Minipool user was not removed correctly');
    assert.isTrue(userRpbBalance2 > userRpbBalance1, 'User RPB balance was not updated correctly');
    assert.isTrue(rpRpbBalance2 > rpRpbBalance1, 'User RPB balance was not updated correctly');
    assert.isTrue(nodeRpbBalance2 > nodeRpbBalance1, 'User RPB balance was not updated correctly');
    assert.isTrue(groupRpbBalance2 > groupRpbBalance1, 'User RPB balance was not updated correctly');
    assert.equal(minipoolRpbBalance2, minipoolRpbBalance1 - totalRpbSent, 'Minipool RPB balance was not updated correctly');
    assert.equal(minipoolEthBalance2, minipoolEthBalance1, 'Minipool ether balance changed and should not have');

}


// Set a backup withdrawal address for a minipool
export async function scenarioSetBackupWithdrawalAddress({withdrawerContract, minipoolAddress, backupWithdrawalAddress, fromAddress, gas}) {
    const minipool = await RocketMinipool.at(minipoolAddress);

    // Get group ID
    let groupID = await withdrawerContract.groupID.call();

    // Get initial backup address status
    let addressFromBackup1 = await minipool.getUserAddressFromBackupAddress.call(backupWithdrawalAddress, groupID);

    // Set backup withdrawal address
    await withdrawerContract.setMinipoolBackupWithdrawalAddress(minipoolAddress, backupWithdrawalAddress, {from: fromAddress, gas: gas});

    // Get updated backup address status
    let addressFromBackup2 = await minipool.getUserAddressFromBackupAddress.call(backupWithdrawalAddress, groupID);

    // Asserts
    assert.equal(addressFromBackup1, '0x0000000000000000000000000000000000000000', 'Backup withdrawal address was already set');
    assert.equal(addressFromBackup2.toLowerCase(), fromAddress.toLowerCase(), 'Backup withdrawal address was not set successfully');

}


// Attempt a deposit via the depositor contract rocketpoolEtherDeposit method
export async function scenarioRocketpoolEtherDeposit({depositorContract, fromAddress, value, gas}) {
    await depositorContract.rocketpoolEtherDeposit({from: fromAddress, value: value, gas: gas});
}


// Attempt a deposit via the deposit API
export async function scenarioAPIDeposit({groupID, userID, durationID, fromAddress, value, gas}) {
    const rocketDepositAPI = await RocketDepositAPI.deployed();

    // Deposit
    await rocketDepositAPI.deposit(groupID, userID, durationID, {from: fromAddress, value: value, gas: gas});

}


// Attempt a queued deposit refund via the deposit API
export async function scenarioAPIRefundQueuedDeposit({groupID, userID, durationID, depositID, fromAddress, gas}) {
    const rocketDepositAPI = await RocketDepositAPI.deployed();

    // Request refund
    await rocketDepositAPI.refundDepositQueued(groupID, userID, durationID, depositID, {from: fromAddress, gas: gas});

}

// Attempt a stalled minipool refund via the deposit API
export async function scenarioAPIRefundStalledMinipoolDeposit({groupID, userID, depositID, minipoolAddress, fromAddress, gas}) {
    const rocketDepositAPI = await RocketDepositAPI.deployed();

    // Refund
    await rocketDepositAPI.refundDepositMinipoolStalled(groupID, userID, depositID, minipoolAddress, {from: fromAddress, gas: gas});

}

// Attempt to withdraw from a staking minipool via the deposit API
export async function scenarioAPIWithdrawStakingMinipoolDeposit({groupID, userID, depositID, minipoolAddress, amount, fromAddress, gas}) {
    const rocketDepositAPI = await RocketDepositAPI.deployed();

    // Withdraw
    await rocketDepositAPI.withdrawDepositMinipoolStaking(groupID, userID, depositID, minipoolAddress, amount, {from: fromAddress, gas: gas});

}


// Attempt to withdraw from a withdrawn minipool via the deposit API
export async function scenarioAPIWithdrawMinipoolDeposit({groupID, userID, depositID, minipoolAddress, fromAddress, gas}) {
    const rocketDepositAPI = await RocketDepositAPI.deployed();

    // Withdraw
    await rocketDepositAPI.withdrawDepositMinipool(groupID, userID, depositID, minipoolAddress, {from: fromAddress, gas: gas});

}


// Attempt to set a backup withdrawal address for a minipool via the deposit API
export async function scenarioAPISetBackupWithdrawalAddress({groupID, userID, minipoolAddress, backupWithdrawalAddress, fromAddress, gas}) {
    const rocketDepositAPI = await RocketDepositAPI.deployed();

    // Set backup withdrawal address
    await rocketDepositAPI.setMinipoolUserBackupWithdrawalAddress(groupID, userID, minipoolAddress, backupWithdrawalAddress, {from: fromAddress, gas: gas});

}

