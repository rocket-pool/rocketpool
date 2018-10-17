// Dependencies
import { profileGasUsage } from '../_lib/utils/profiling';
import { RocketGroupAPI, RocketGroupSettings } from '../_lib/artifacts';


// Add a group
export async function scenarioAddGroup({name, stakingFee, value, fromAddress, gas}) {
    const rocketGroupAPI = await RocketGroupAPI.deployed();
    const rocketGroupSettings = await RocketGroupSettings.deployed();

    // Get group creation fee address
    let feeAddress = await rocketGroupSettings.getNewFeeAddress();

    // Get initial group creation fee address balance
    let feeBalance1 = parseInt(await web3.eth.getBalance(feeAddress));

    // Add group
    let result = await rocketGroupAPI.add(name, stakingFee, {from: fromAddress, gas: gas, value: value});
    profileGasUsage('RocketGroupAPI.add', result);

    // Get updated group creation fee address balance
    let feeBalance2 = parseInt(await web3.eth.getBalance(feeAddress));

    // Asserts
    let groupAddEvents = result.logs.filter(log => (log.event == 'GroupAdd'));
    assert.equal(groupAddEvents.length, 1, 'Group was not created successfully');
    assert.isTrue(feeBalance2 > feeBalance1, 'Creation fee balance was not transferred successfully');

    // Return group ID
    return groupAddEvents[0].args.ID;

}


// Create a default group accessor
export async function scenarioCreateDefaultGroupAccessor({groupID, fromAddress, gas}) {
    const rocketGroupAPI = await RocketGroupAPI.deployed();

    // Create accessor
    let result = await rocketGroupAPI.createDefaultAccessor(groupID, {from: fromAddress, gas: gas});
    profileGasUsage('RocketGroupAPI.createDefaultAccessor', result);

    // Asserts
    let groupCreateAccessorEvents = result.logs.filter(log => (log.event == 'GroupCreateDefaultAccessor'));
    assert.equal(groupCreateAccessorEvents.length, 1, 'Accessor was not created successfully');

    // Return accessor address
    return groupCreateAccessorEvents[0].args.accessorAddress;

}

