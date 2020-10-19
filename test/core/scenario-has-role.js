import { RocketStorage } from '../_utils/artifacts';


// Transfer role to an address
export async function hasRole(role, address, txOptions) {

    // Load contracts
    const [
        rocketStorage,
    ] = await Promise.all([
        RocketStorage.deployed(),
    ]);

    // Get role key
    let roleAddressKey = web3.utils.soliditySha3('access.role', role, address);

    // Has this role?
    let hasRole = await rocketStorage.getBool.call(roleAddressKey);

    // Verify
    assert.isTrue(hasRole, 'Address '+address+' does not have role '+role);

}

