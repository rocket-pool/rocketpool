import { RocketRole, RocketStorage } from '../_utils/artifacts';


// Transfer role to an address
export async function transferRole(role, to, txOptions) {

    // Load contracts
    const [
        rocketRole,
        rocketStorage,
    ] = await Promise.all([
        RocketRole.deployed(),
        RocketStorage.deployed(),
    ]);

    // Get role key
    let roleAddressFromKey = web3.utils.soliditySha3('access.role', role, txOptions.from);
    let roleAddressToKey = web3.utils.soliditySha3('access.role', role, to);

    // Get initial role statuses
    let [roleFromBefore, roleToBefore] = await Promise.all([
        rocketStorage.getBool.call(roleAddressFromKey),
        rocketStorage.getBool.call(roleAddressToKey),
    ]);

    // Transfer
    await rocketRole.transferRole(role, to, txOptions);

    // Get updated role statuses
    let [roleFromAfter, roleToAfter] = await Promise.all([
        rocketStorage.getBool.call(roleAddressFromKey),
        rocketStorage.getBool.call(roleAddressToKey),
    ]);

    // Check statuses
    assert.isTrue(roleFromBefore, 'From address does not have this role to transfer');
    assert.isFalse(roleToBefore, 'To address already has this role');
    assert.isFalse(roleFromAfter, 'From address still has role');
    assert.isTrue(roleToAfter, 'To address did not receive role transfer');
    

}

