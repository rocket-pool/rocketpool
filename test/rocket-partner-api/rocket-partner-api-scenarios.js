import { RocketPartnerAPI, RocketPool, RocketPoolMini, RocketSettings } from '../artifacts';


// Registers partner and asserts that number of registered partners increased
export async function scenarioRegisterPartner({partnerAddress, partnerName, fromAddress, gas}) {
    const rocketPartnerAPI = await RocketPartnerAPI.deployed();

    // Get initial partner count
    let partnerCountOld = await rocketPartnerAPI.getPartnerCount.call();

    // Register partner
    await rocketPartnerAPI.partnerAdd(partnerAddress, partnerName, {
        from: fromAddress,
        gas: gas,
    });

    // Get updated partner count
    let partnerCountNew = await rocketPartnerAPI.getPartnerCount.call();

    // Assert that updated partner count is correct
    assert.equal(partnerCountNew.valueOf(), parseInt(partnerCountOld.valueOf()) + 1, 'Invalid number of partners registered');

}


// Makes a deposit with a partner and asserts deposit was made successfully
export async function scenarioPartnerDeposit({userAddress, stakingTimeID, fromAddress, depositAmount, gas}) {
    const rocketPartnerAPI = await RocketPartnerAPI.deployed();
    const rocketPool = await RocketPool.deployed();
    const rocketSettings = await RocketSettings.deployed();

    // Get minimum ether required to launch minipool
    const minEtherRequired = await rocketSettings.getMiniPoolLaunchAmount.call();

    // Get initial minipools
    let openMiniPoolsOld = await rocketPool.getPoolsFilterWithStatus.call(0);
    let userMiniPoolsOld = await rocketPool.getPoolsFilterWithUserDeposit.call(userAddress);

    // Get initial minipool properties
    let miniPoolBalanceOld = 0;
    if (openMiniPoolsOld.length) {
        let openMiniPoolOld = RocketPoolMini.at(openMiniPoolsOld[0]);
        miniPoolBalanceOld = web3.eth.getBalance(openMiniPoolOld.address);
    }

    // Make deposit
    let result = await rocketPartnerAPI.APIpartnerDeposit(userAddress, stakingTimeID, {
        from: fromAddress,
        value: depositAmount,
        gas: gas,
    });

    //// Get updated minipools
    //let openMiniPoolsNew = await rocketPool.getPoolsFilterWithStatus.call(0);
    //let userMiniPoolsNew = await rocketPool.getPoolsFilterWithUserDeposit.call(userAddress);

    // Assert APIpartnerDepositAccepted event was logged
    let log = result.logs.find(({ event }) => event == 'APIpartnerDepositAccepted');
    assert.notEqual(log, undefined, 'APIpartnerDepositAccepted event was not logged');

    // Get deposit properties
    let depositPartnerAddress = log.args._partner;

    // Find the minipools the user belongs to
    let userMiniPools = await rocketPool.getPoolsFilterWithUserDeposit.call(userAddress, {from: fromAddress});

    // Get an instance of the latest minipool and its properties
    let miniPool = RocketPoolMini.at(userMiniPools[userMiniPools.length - 1]);
    let miniPoolStatus = await miniPool.getStatus.call();
    let miniPoolBalance = web3.eth.getBalance(miniPool.address);

    // Check partner address from deposit matches
    assert.equal(depositPartnerAddress, fromAddress, 'Partner address from deposit does not match');

    // Check the minipool status
    let expectedStatus = (miniPoolBalance.valueOf() < minEtherRequired.valueOf() ? 0 : 1);
    assert.equal(miniPoolStatus.valueOf(), expectedStatus, 'Invalid minipool status');

    // No open minipools initially existed - expect new minipool to have been created
    if (!openMiniPoolsOld.length) {
        assert.equal(miniPoolBalance.valueOf(), depositAmount, 'Invalid minipool balance'); // Initial balance should be the deposit amount
        assert.equal(userMiniPools.length, userMiniPoolsOld.length + 1, 'Invalid user minipool count'); // Number of user minipools should increment
    }

    // Open minipool initially existed - expect existing minipool to have been used
    else {
        assert.equal(miniPoolBalance.valueOf(), parseInt(miniPoolBalanceOld.valueOf()) + depositAmount, 'Invalid minipool balance'); // Balance should be increased by the deposit amount
        assert.equal(userMiniPools.length, userMiniPoolsOld.length, 'Invalid user minipool count'); // Number of user minipools should remain the same
    }

}


// Makes a withdrawal with a partner and asserts withdrawal was made successfully
export async function scenarioPartnerWithdraw({miniPool, withdrawalAmount, userAddress, fromAddress, gas}) {
    const rocketPartnerAPI = await RocketPartnerAPI.deployed();
    const rocketPool = await RocketPool.deployed();

    // Ignore exceptions thrown on invalid minipool test
    let depositedAmountOld, miniPoolUserCountOld;
    try {

        // Get initial deposit amount
        depositedAmountOld = await miniPool.getUserDeposit.call(userAddress);

        // Get initial minipool user count
        miniPoolUserCountOld = await miniPool.getUserCount.call();

    }
    catch (e) {}

    // Make withdrawal
    await rocketPartnerAPI.APIpartnerWithdrawal(miniPool.address, withdrawalAmount, userAddress, {
        from: fromAddress,
        gas: gas,
    });

    // Check that minipool contract has been destroyed if entire last deposit was withdrawn
    if (depositedAmountOld.valueOf() == withdrawalAmount && miniPoolUserCountOld.valueOf() == 1) {
        let miniPoolExists = await rocketPool.getPoolExists.call(miniPool.address);
        assert.isFalse(miniPoolExists.valueOf(), 'Minipool exists when it should have been destroyed');
    }
    else {
        // Otherwise check that the deposit has been updated

        // Get updated deposit amount
        let depositedAmountNew = await miniPool.getUserDeposit.call(userAddress);

        // Assert that deposit amount was updated successfully
        assert.equal(depositedAmountNew.valueOf(), parseInt(depositedAmountOld.valueOf()) - withdrawalAmount, 'Minipool deposit amount was not updated correctly');
    }

}


// Removes a partner and asserts that partner was removed successfully
export async function scenarioRemovePartner({partnerAddress, fromAddress, gas}) {
    const rocketPartnerAPI = await RocketPartnerAPI.deployed();

    // Get initial partner count
    let partnerCountOld = await rocketPartnerAPI.getPartnerCount.call();

    // Remove the partner
    let result = await rocketPartnerAPI.partnerRemove(partnerAddress, {from: fromAddress, gas: gas});

    // Check that PartnerRemoved event was logged
    let log = result.logs.find(({ event }) => event == 'PartnerRemoved');
    assert.notEqual(log, undefined, 'PartnerRemoved event was not logged');

    // Get removed partner address
    let removedPartnerAddress = log.args._address;

    // Get updated partner count
    let partnerCountNew = await rocketPartnerAPI.getPartnerCount.call();

    // Asserts
    assert.equal(partnerAddress, removedPartnerAddress, 'Removed partner address does not match');
    assert.equal(partnerCountNew.valueOf(), parseInt(partnerCountOld.valueOf()) - 1, 'Partner count is incorrect');

}

