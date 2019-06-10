// Dependencies
import { getTransactionContractEvents } from '../_lib/utils/general';
import { getValidatorStatus } from '../_lib/utils/beacon';
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


// Get deposit details
async function getDepositDetails(depositID) {
    const rocketDepositIndex = await RocketDepositIndex.deployed();

    // Get deposit data
    let [totalAmount, queuedAmount, stakingAmount, refundedAmount, withdrawnAmount, stakingPoolCount] = await Promise.all([
        rocketDepositIndex.getUserDepositTotalAmount.call(depositID),
        rocketDepositIndex.getUserDepositQueuedAmount.call(depositID),
        rocketDepositIndex.getUserDepositStakingAmount.call(depositID),
        rocketDepositIndex.getUserDepositRefundedAmount.call(depositID),
        rocketDepositIndex.getUserDepositWithdrawnAmount.call(depositID),
        rocketDepositIndex.getUserDepositStakingPoolCount.call(depositID),
    ]);

    // Get staking pools
    let pi, poolAddress, poolAmount, pools = {};
    for (pi = 0; pi < stakingPoolCount; ++pi) {
        poolAddress = await rocketDepositIndex.getUserDepositStakingPoolAt.call(depositID, pi);
        poolAmount = await rocketDepositIndex.getUserDepositStakingPoolAmount.call(depositID, poolAddress);
        pools[poolAddress.toLowerCase()] = poolAmount;
    }

    // Return
    return {
        totalAmount,
        queuedAmount,
        stakingAmount,
        refundedAmount,
        withdrawnAmount,
        pools,
    };

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

    // Get deposit enqueue events & deposit ID
    let depositEnqueueEvents = getTransactionContractEvents(result, rocketDepositQueue.address, 'DepositEnqueue', [
        {type: 'bytes32', name: '_depositID', indexed: true},
        {type: 'address', name: '_userID', indexed: true},
        {type: 'address', name: '_groupID', indexed: true},
        {type: 'string',  name: 'durationID'},
        {type: 'uint256', name: 'value'},
        {type: 'uint256', name: 'created'},
    ]);
    let depositID = depositEnqueueEvents[0]._depositID;

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

    // Get total ether assigned in chunk fragments from current deposit
    let depositEtherAssigned = chunkFragmentAssignEvents.filter(event => event._depositID == depositID).reduce((acc, val) => (acc + parseInt(val.value)), 0);

    // Get total ether assigned in chunk fragments from current deposit per minipool
    let depositMinipoolEtherAssigned = {};
    chunkFragmentAssignEvents.filter(event => event._depositID == depositID).forEach(event => {
        let address = event._minipoolAddress.toLowerCase();
        if (depositMinipoolEtherAssigned[address] === undefined) depositMinipoolEtherAssigned[address] = 0;
        depositMinipoolEtherAssigned[address] += parseInt(event.value);
    });

    // Check total ether assigned
    assert.equal(etherAssigned, chunkSize * expectedChunkAssignments, 'Expected number of chunk assignments not performed');

    // Check deposit details
    let depositDetails = await getDepositDetails(depositID);
    assert.equal(parseInt(depositDetails.totalAmount), parseInt(value), 'Deposit total amount does not match amount deposited');
    assert.equal(parseInt(depositDetails.queuedAmount), parseInt(value) - depositEtherAssigned, 'Deposit queued amount does not match expected value');
    assert.equal(parseInt(depositDetails.stakingAmount), depositEtherAssigned, 'Deposit staking amount does not match expected value');
    for (let address in depositMinipoolEtherAssigned) {
        let amount = depositMinipoolEtherAssigned[address];
        assert.property(depositDetails.pools, address, 'Deposit staking pool not found');
        assert.equal(parseInt(depositDetails.pools[address]), amount, 'Deposit staking pool amount does not match expected value');
    }

    // Check assigned minipools
    for (let address in minipoolEtherAssigned) {
        let amount = minipoolEtherAssigned[address];

        // Get expected minipool balance
        let expectedBalance = minipoolBalances1[address] + amount;

        // Minipool launching
        if (expectedBalance >= launchAmount) {
            expectedBalance = 0;

            // Get minipool's validator pubkey
            let minipool = await RocketMinipool.at(address);
            let pubkey = (await minipool.getValidatorPubkey.call()).substr(2);

            // Check for validator on beacon chain
            let validatorExists = true;
            try { await getValidatorStatus(pubkey); }
            catch (e) { validatorExists = false; }
            assert.isTrue(validatorExists, 'Launched minipool validator does not exist on beacon chain');

        }

        // Check minipool balance
        assert.equal(minipoolBalances2[address], expectedBalance, 'Assigned minipool balance was not updated correctly');

    }

    // Check assigned users
    for (let i = 0; i < chunkFragmentAssignEvents.length; ++i) {

        // Get details & minipool
        let depositID = chunkFragmentAssignEvents[i]._depositID;
        let userID = chunkFragmentAssignEvents[i].userID;
        let groupID = chunkFragmentAssignEvents[i].groupID;
        let minipoolAddress = chunkFragmentAssignEvents[i]._minipoolAddress;
        let minipool = await RocketMinipool.at(minipoolAddress);

        // Get minipool deposit details
        let depositExists = await minipool.getDepositExists.call(depositID);
        let depositUserID = await minipool.getDepositUserID.call(depositID);
        let depositGroupID = await minipool.getDepositGroupID.call(depositID);
        let depositStakingTokensWithdrawn = parseInt(await minipool.getDepositStakingTokensWithdrawn.call(depositID));

        // Asserts
        assert.isTrue(depositExists, 'Incorrect minipool deposit exists status');
        assert.equal(depositUserID, userID, 'Incorrect minipool deposit user ID');
        assert.equal(depositGroupID, groupID, 'Incorrect minipool deposit user ID');
        assert.equal(depositStakingTokensWithdrawn, 0, 'Incorrect minipool user staking tokens withdrawn count');

    }

}


// Request a refund from a queued deposit
export async function scenarioRefundQueuedDeposit({depositorContract, groupID, durationID, depositID, fromAddress, gas}) {
    const rocketDepositIndex = await RocketDepositIndex.deployed();
    const rocketDepositQueue = await RocketDepositQueue.deployed();

    // Get initial from address balance
    let fromBalance1 = parseInt(await web3.eth.getBalance(fromAddress));

    // Get initial deposit details
    let depositDetails1 = await getDepositDetails(depositID);

    // Get initial queue status
    let depositCount1 = parseInt(await rocketDepositIndex.getUserQueuedDepositCount.call(groupID, fromAddress, durationID));
    let depositBalance1 = parseInt(await rocketDepositIndex.getUserDepositQueuedAmount.call(depositID));
    let queueBalance1 = parseInt(await rocketDepositQueue.getBalance.call(durationID));

    // Request refund
    let result = await depositorContract.depositRefundQueued(durationID, depositID, {from: fromAddress, gas: gas});

    // Get updated from address balance
    let fromBalance2 = parseInt(await web3.eth.getBalance(fromAddress));

    // Get updated deposit details
    let depositDetails2 = await getDepositDetails(depositID);

    // Get updated queue status
    let depositCount2 = parseInt(await rocketDepositIndex.getUserQueuedDepositCount.call(groupID, fromAddress, durationID));
    let depositBalance2 = parseInt(await rocketDepositIndex.getUserDepositQueuedAmount.call(depositID));
    let queueBalance2 = parseInt(await rocketDepositQueue.getBalance.call(durationID));

    // Asserts
    assert.equal(parseInt(depositDetails2.queuedAmount), 0, 'Deposit queued amount was not decreased');
    assert.equal(parseInt(depositDetails2.refundedAmount), parseInt(depositDetails1.refundedAmount) + parseInt(depositDetails1.queuedAmount), 'Deposit refunded amount was not increased correctly');
    assert.isTrue(fromBalance2 > fromBalance1, 'From address balance was not increased');
    assert.equal(depositCount2, depositCount1 - 1, 'User deposit count was not decremented');
    assert.equal(depositBalance2, 0, 'Queued deposit balance was not set to 0');
    assert.equal(queueBalance2, queueBalance1 - depositBalance1, 'Deposit queue balance was not decreased by deposit amount');

}


// Request a refund from a stalled minipool
export async function scenarioRefundStalledMinipoolDeposit({depositorContract, depositID, minipoolAddress, fromAddress, gas}) {
    const minipool = await RocketMinipool.at(minipoolAddress);

    // Get initial balances
    let minipoolBalance1 = parseInt(await web3.eth.getBalance(minipoolAddress));
    let userBalance1 = parseInt(await web3.eth.getBalance(fromAddress));

    // Get initial deposit details
    let depositDetails1 = await getDepositDetails(depositID);

    // Get initial minipool deposit status
    let depositCount1 = parseInt(await minipool.getDepositCount.call());
    let depositExists1 = await minipool.getDepositExists.call(depositID);
    let depositBalance1 = parseInt(await minipool.getDepositBalance.call(depositID));

    // Refund
    let result = await depositorContract.depositRefundMinipoolStalled(depositID, minipoolAddress, {from: fromAddress, gas: gas});
    profileGasUsage('RocketGroupAccessorContract.depositRefundMinipoolStalled', result);

    // Get updated balances
    let minipoolBalance2 = parseInt(await web3.eth.getBalance(minipoolAddress));
    let userBalance2 = parseInt(await web3.eth.getBalance(fromAddress));

    // Get updated deposit details
    let depositDetails2 = await getDepositDetails(depositID);

    // Get updated minipool deposit status
    let depositCount2 = parseInt(await minipool.getDepositCount.call());
    let depositExists2 = await minipool.getDepositExists.call(depositID);
    let depositBalance2 = parseInt(await minipool.getDepositBalance.call(depositID));

    // Asserts
    assert.equal(parseInt(depositDetails2.stakingAmount), parseInt(depositDetails1.stakingAmount) - depositBalance1, 'Deposit staking amount was not decreased correctly');
    assert.equal(parseInt(depositDetails2.refundedAmount), parseInt(depositDetails1.refundedAmount) + depositBalance1, 'Deposit refunded amount was not increased correctly');
    assert.equal(depositDetails2.pools[minipoolAddress.toLowerCase()], undefined, 'Deposit staking pool was not removed correctly');
    assert.equal(depositCount2, depositCount1 - 1, 'Minipool deposit count was not updated correctly');
    assert.equal(depositExists1, true, 'Initial minipool deposit exists check incorrect');
    assert.equal(depositExists2, false, 'Second minipool deposit exists check incorrect');
    assert.isTrue(depositBalance1 > 0, 'Initial deposit deposit check incorrect');
    assert.isTrue(depositBalance2 == 0, 'Second deposit deposit check incorrect');
    assert.equal(minipoolBalance2, minipoolBalance1 - depositBalance1, 'Minipool balance was not updated correctly');
    assert.isTrue(userBalance2 > userBalance1, 'User balance was not updated correctly');

}


// Withdraw a deposit from a staking minipool
export async function scenarioWithdrawStakingMinipoolDeposit({withdrawerContract, depositID, minipoolAddress, amount, amountInt, fromAddress, gas}) {
    const minipool = await RocketMinipool.at(minipoolAddress);
    const rocketBETHToken = await RocketBETHToken.deployed();

    // Initialise params
    if (amountInt === undefined) amountInt = parseInt(amount);

    // Get initial balances
    let minipoolEthBalance1 = parseInt(await web3.eth.getBalance(minipoolAddress));
    let userRpbBalance1 = parseInt(await rocketBETHToken.balanceOf.call(fromAddress));

    // Get initial minipool deposit status
    let depositCount1 = parseInt(await minipool.getDepositCount.call());
    let depositExists1 = await minipool.getDepositExists.call(depositID);
    let depositBalance1 = parseInt(await minipool.getDepositBalance.call(depositID));
    let depositStakingTokensWithdrawn1 = parseInt(await minipool.getDepositStakingTokensWithdrawn.call(depositID));

    // Get initial deposit details
    let depositDetails1 = await getDepositDetails(depositID);

    // Check if the deposit should be removed
    let expectDepositRemoved = (amountInt == depositBalance1);

    // Withdraw
    let result = await withdrawerContract.depositWithdrawMinipoolStaking(depositID, minipoolAddress, amount, {from: fromAddress, gas: gas});
    profileGasUsage('RocketGroupAccessorContract.depositWithdrawMinipoolStaking', result);

    // Get updated balances
    let minipoolEthBalance2 = parseInt(await web3.eth.getBalance(minipoolAddress));
    let userRpbBalance2 = parseInt(await rocketBETHToken.balanceOf.call(fromAddress));

    // Get updated minipool deposit status
    let depositCount2 = parseInt(await minipool.getDepositCount.call());
    let depositExists2 = await minipool.getDepositExists.call(depositID);
    let depositBalance2 = parseInt(await minipool.getDepositBalance.call(depositID));
    let depositStakingTokensWithdrawn2 = parseInt(await minipool.getDepositStakingTokensWithdrawn.call(depositID));

    // Get updated deposit details
    let depositDetails2 = await getDepositDetails(depositID);

    // Asserts
    assert.equal(parseInt(depositDetails2.stakingAmount), parseInt(depositDetails1.stakingAmount) - amountInt, 'Deposit staking amount was not decreased correctly');
    assert.equal(parseInt(depositDetails2.withdrawnAmount), parseInt(depositDetails1.withdrawnAmount) + amountInt, 'Deposit withdrawn amount was not increased correctly');
    if (expectDepositRemoved) assert.equal(depositDetails2.pools[minipoolAddress.toLowerCase()], undefined, 'Deposit staking pool was not removed correctly');
    else assert.equal(depositDetails2.pools[minipoolAddress.toLowerCase()], depositDetails1.pools[minipoolAddress.toLowerCase()] - amountInt, 'Deposit staking pool amount was not decreased correctly');
    assert.equal(depositCount2, (expectDepositRemoved ? depositCount1 - 1 : depositCount1), 'Minipool deposit count was not updated correctly');
    assert.equal(depositExists1, true, 'Initial minipool deposit exists check incorrect');
    assert.equal(depositExists2, !expectDepositRemoved, 'Second minipool deposit exists check incorrect');
    assert.isTrue(depositBalance1 > 0, 'Initial deposit balance check incorrect');
    assert.equal(depositBalance2, depositBalance1 - amountInt, 'Deposit balance was not updated correctly');
    assert.isTrue((expectDepositRemoved ? depositStakingTokensWithdrawn2 == 0 : depositStakingTokensWithdrawn2 > depositStakingTokensWithdrawn1), 'Deposit staking tokens withdrawn was not updated correctly');
    assert.isTrue(userRpbBalance2 > userRpbBalance1, 'User RPB balance was not updated correctly');
    assert.equal(minipoolEthBalance2, minipoolEthBalance1, 'Minipool ether balance changed and should not have');

}


// Withdraw a deposit from a withdrawn minipool
export async function scenarioWithdrawMinipoolDeposit({withdrawerContract, depositID, minipoolAddress, fromAddress, gas}) {
    const minipool = await RocketMinipool.at(minipoolAddress);
    const rocketBETHToken = await RocketBETHToken.deployed();
    const rocketMinipoolSettings = await RocketMinipoolSettings.deployed();

    // Get group contract
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

    // Get initial minipool deposit status
    let depositCount1 = parseInt(await minipool.getDepositCount.call());
    let depositExists1 = await minipool.getDepositExists.call(depositID);
    let depositBalance1 = parseInt(await minipool.getDepositBalance.call(depositID));

    // Get initial deposit details
    let depositDetails1 = await getDepositDetails(depositID);

    // Withdraw
    let result = await withdrawerContract.depositWithdrawMinipool(depositID, minipoolAddress, {from: fromAddress, gas: gas});
    profileGasUsage('RocketGroupAccessorContract.depositWithdrawMinipool', result);

    // Get updated balances
    let minipoolEthBalance2 = parseInt(await web3.eth.getBalance(minipoolAddress));
    let minipoolRpbBalance2 = parseInt(await rocketBETHToken.balanceOf.call(minipoolAddress));
    let userRpbBalance2 = parseInt(await rocketBETHToken.balanceOf.call(fromAddress));
    let rpRpbBalance2 = parseInt(await rocketBETHToken.balanceOf.call(rpFeeAddress));
    let nodeRpbBalance2 = parseInt(await rocketBETHToken.balanceOf.call(nodeFeeAddress));
    let groupRpbBalance2 = parseInt(await rocketBETHToken.balanceOf.call(groupFeeAddress));

    // Get updated minipool deposit status
    let depositCount2 = parseInt(await minipool.getDepositCount.call());
    let depositExists2 = await minipool.getDepositExists.call(depositID);
    let depositBalance2 = parseInt(await minipool.getDepositBalance.call(depositID));

    // Get updated deposit details
    let depositDetails2 = await getDepositDetails(depositID);

    // Get RPB transfer amounts
    let userRpbSent = userRpbBalance2 - userRpbBalance1;
    let rpRpbSent = rpRpbBalance2 - rpRpbBalance1;
    let nodeRpbSent = nodeRpbBalance2 - nodeRpbBalance1;
    let groupRpbSent = groupRpbBalance2 - groupRpbBalance1;
    let totalRpbSent = userRpbSent + rpRpbSent + nodeRpbSent + groupRpbSent;

    // Asserts
    assert.equal(parseInt(depositDetails2.stakingAmount), parseInt(depositDetails1.stakingAmount) - depositBalance1, 'Deposit staking amount was not decreased correctly');
    assert.equal(parseInt(depositDetails2.withdrawnAmount), parseInt(depositDetails1.withdrawnAmount) + depositBalance1, 'Deposit withdrawn amount was not increased correctly');
    assert.equal(depositDetails2.pools[minipoolAddress.toLowerCase()], undefined, 'Deposit staking pool was not removed correctly');
    assert.equal(depositCount2, depositCount1 - 1, 'Minipool deposit count was not updated correctly');
    assert.equal(depositExists1, true, 'Initial minipool deposit exists check incorrect');
    assert.equal(depositExists2, false, 'Minipool deposit was not removed correctly');
    assert.equal(depositBalance2, 0, 'Minipool deposit balance was not updated correctly');
    assert.isTrue(userRpbBalance2 > userRpbBalance1, 'User RPB balance was not updated correctly');
    assert.isTrue(rpRpbBalance2 > rpRpbBalance1, 'RP RPB balance was not updated correctly');
    assert.isTrue(nodeRpbBalance2 > nodeRpbBalance1, 'Node RPB balance was not updated correctly');
    assert.isTrue(groupRpbBalance2 > groupRpbBalance1, 'Group RPB balance was not updated correctly');
    assert.equal(minipoolRpbBalance2, minipoolRpbBalance1 - totalRpbSent, 'Minipool RPB balance was not updated correctly');
    assert.equal(minipoolEthBalance2, minipoolEthBalance1, 'Minipool ether balance changed and should not have');

}


// Set a backup withdrawal address for a minipool
export async function scenarioSetBackupWithdrawalAddress({withdrawerContract, depositID, backupWithdrawalAddress, fromAddress, gas}) {
    const rocketDepositIndex = await RocketDepositIndex.deployed();

    // Get initial deposit backup address
    let backupAddress1 = await rocketDepositIndex.getUserDepositBackupAddress.call(depositID);

    // Set backup withdrawal address
    await withdrawerContract.setDepositBackupWithdrawalAddress(depositID, backupWithdrawalAddress, {from: fromAddress, gas: gas});

    // Get updated deposit backup address
    let backupAddress2 = await rocketDepositIndex.getUserDepositBackupAddress.call(depositID);

    // Asserts
    assert.equal(backupAddress1, '0x0000000000000000000000000000000000000000', 'Backup withdrawal address was already set');
    assert.equal(backupAddress2.toLowerCase(), backupWithdrawalAddress.toLowerCase(), 'Backup withdrawal address was not set successfully');

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
    await rocketDepositAPI.depositRefundQueued(groupID, userID, durationID, depositID, {from: fromAddress, gas: gas});

}

// Attempt a stalled minipool refund via the deposit API
export async function scenarioAPIRefundStalledMinipoolDeposit({groupID, userID, depositID, minipoolAddress, fromAddress, gas}) {
    const rocketDepositAPI = await RocketDepositAPI.deployed();

    // Refund
    await rocketDepositAPI.depositRefundMinipoolStalled(groupID, userID, depositID, minipoolAddress, {from: fromAddress, gas: gas});

}

// Attempt to withdraw from a staking minipool via the deposit API
export async function scenarioAPIWithdrawStakingMinipoolDeposit({groupID, userID, depositID, minipoolAddress, amount, fromAddress, gas}) {
    const rocketDepositAPI = await RocketDepositAPI.deployed();

    // Withdraw
    await rocketDepositAPI.depositWithdrawMinipoolStaking(groupID, userID, depositID, minipoolAddress, amount, {from: fromAddress, gas: gas});

}


// Attempt to withdraw from a withdrawn minipool via the deposit API
export async function scenarioAPIWithdrawMinipoolDeposit({groupID, userID, depositID, minipoolAddress, fromAddress, gas}) {
    const rocketDepositAPI = await RocketDepositAPI.deployed();

    // Withdraw
    await rocketDepositAPI.depositWithdrawMinipool(groupID, userID, depositID, minipoolAddress, {from: fromAddress, gas: gas});

}


// Attempt to set a backup withdrawal address for a minipool via the deposit API
export async function scenarioAPISetBackupWithdrawalAddress({groupID, userID, depositID, backupWithdrawalAddress, fromAddress, gas}) {
    const rocketDepositAPI = await RocketDepositAPI.deployed();

    // Set backup withdrawal address
    await rocketDepositAPI.setDepositBackupWithdrawalAddress(groupID, userID, depositID, backupWithdrawalAddress, {from: fromAddress, gas: gas});

}

