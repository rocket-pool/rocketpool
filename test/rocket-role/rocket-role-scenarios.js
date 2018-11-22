// Dependencies
import { RocketRole, RocketStorage } from '../_lib/artifacts';


// Add a role to an address
export async function scenarioAddRole({role, address, fromAddress, gas}) {
    const rocketRole = await RocketRole.deployed();
    const rocketStorage = await RocketStorage.deployed();

    // Get initial role status
    let roleExists1 = await rocketStorage.getBool.call(web3.utils.soliditySha3('access.role', role, address));

    // Add role
    await rocketRole.adminRoleAdd(role, address, {from: fromAddress, gas: gas});

    // Get updated role status
    let roleExists2 = await rocketStorage.getBool.call(web3.utils.soliditySha3('access.role', role, address));

    // Asserts
    assert.equal(roleExists1, false, 'Initial address role status was incorrect');
    assert.equal(roleExists2, true, 'Address role status was not updated successfully');

}


// Remove a role from an address
export async function scenarioRemoveRole({role, address, fromAddress, gas}) {
    const rocketRole = await RocketRole.deployed();
    const rocketStorage = await RocketStorage.deployed();

    // Get initial role status
    let roleExists1 = await rocketStorage.getBool.call(web3.utils.soliditySha3('access.role', role, address));

    // Remove role
    await rocketRole.adminRoleRemove(role, address, {from: fromAddress, gas: gas});

    // Get updated role status
    let roleExists2 = await rocketStorage.getBool.call(web3.utils.soliditySha3('access.role', role, address));

    // Asserts
    assert.equal(roleExists1, true, 'Initial address role status was incorrect');
    assert.equal(roleExists2, false, 'Address role status was not updated successfully');

}


// Transfer ownership role to a new address
export async function scenarioTransferOwnership({toAddress, fromAddress, gas}) {
    const rocketRole = await RocketRole.deployed();
    const rocketStorage = await RocketStorage.deployed();

    // Get initial ownership status
    let oldOwnerExists1 = await rocketStorage.getBool.call(web3.utils.soliditySha3('access.role', 'owner', fromAddress));
    let newOwnerExists1 = await rocketStorage.getBool.call(web3.utils.soliditySha3('access.role', 'owner', toAddress));

    // Transfer ownership
    await rocketRole.transferOwnership(toAddress, {from: fromAddress, gas: gas});

    // Get updated ownership status
    let oldOwnerExists2 = await rocketStorage.getBool.call(web3.utils.soliditySha3('access.role', 'owner', fromAddress));
    let newOwnerExists2 = await rocketStorage.getBool.call(web3.utils.soliditySha3('access.role', 'owner', toAddress));

    // Asserts
    assert.equal(oldOwnerExists1, true, 'Initial old owner address ownership status was incorrect');
    assert.equal(newOwnerExists1, false, 'Initial new owner address ownership status was incorrect');
    assert.equal(oldOwnerExists2, false, 'Old owner address ownership status was not updated successfully');
    assert.equal(newOwnerExists2, true, 'New owner address ownership status was not updated successfully');

}

