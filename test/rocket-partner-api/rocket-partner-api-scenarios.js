import { RocketPartnerAPI } from '../artifacts';


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


// Makes a deposit with a partner
export async function scenarioPartnerDeposit({userAddress, stakingTimeID, fromAddress, value, gas}) {
    const rocketPartnerAPI = await RocketPartnerAPI.deployed();

    // Make deposit
    await rocketPartnerAPI.APIpartnerDeposit(userAddress, stakingTimeID, {
        from: fromAddress,
        value: value,
        gas: gas,
    });

    // TODO: add assertions

}


// Removes a partner and asserts that partner was removed successfully
export async function scenarioRemovePartner({partnerAddress, newerPartnerAddress, fromAddress, gas}) {
    const rocketPartnerAPI = await RocketPartnerAPI.deployed();

    // Get initial partner count & newer partner index
    let partnerCountOld = await rocketPartnerAPI.getPartnerCount.call();
    let newerPartnerIndexOld = await rocketPartnerAPI.getPartnerIndex.call(newerPartnerAddress);

    // Remove the partner
    let result = await rocketPartnerAPI.partnerRemove(partnerAddress, {from: fromAddress, gas: gas});

    // Check that PartnerRemoved event was logged
    let log = result.logs.find(({ event }) => event == 'PartnerRemoved');
    assert.notEqual(log, undefined, 'PartnerRemoved event was not logged');

    // Get removed partner address
    let removedPartnerAddress = log.args._address;

    // Get updated partner count & newer partner index
    let partnerCountNew = await rocketPartnerAPI.getPartnerCount.call();
    let newerPartnerIndexNew = await rocketPartnerAPI.getPartnerIndex.call(newerPartnerAddress);

    // Asserts
    assert.equal(partnerAddress, removedPartnerAddress, 'Removed partner address does not match');
    assert.equal(partnerCountNew.valueOf(), parseInt(partnerCountOld.valueOf()) - 1, 'Partner count is incorrect');
    assert.equal(newerPartnerIndexNew.valueOf(), parseInt(newerPartnerIndexOld.valueOf()) - 1, 'Newer partner index is incorrect');

}

