import { RocketRole, RocketStorage } from '../_utils/artifacts';


// Remove a role from an address
export async function removeRole(role, address, txOptions) {

    // Load contracts
    const [
        rocketRole,
        rocketStorage,
    ] = await Promise.all([
        RocketRole.deployed(),
        RocketStorage.deployed(),
    ]);

    // Get role key
    let roleAddressKey = web3.utils.soliditySha3('access.role', role, address);

    // Get initial role status
    let roleSet1 = await rocketStorage.getBool.call(roleAddressKey);

    // Remove role
    await rocketRole.removeRole(role, address, txOptions);

    // Get updated role status
    let roleSet2 = await rocketStorage.getBool.call(roleAddressKey);

    // Check role status
    assert.isTrue(roleSet1, 'Incorrect initial role set status');
    assert.isFalse(roleSet2, 'Incorrect updated role set status');

}

