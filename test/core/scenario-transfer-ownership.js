import { RocketRole, RocketStorage } from '../_utils/artifacts';


// Transfer ownership to an address
export async function transferOwnership(address, txOptions) {

    // Load contracts
    const [
        rocketRole,
        rocketStorage,
    ] = await Promise.all([
        RocketRole.deployed(),
        RocketStorage.deployed(),
    ]);

    // Get role keys
    let ownerSenderKey = web3.utils.soliditySha3('access.role', 'owner', txOptions.from);
    let ownerAddressKey = web3.utils.soliditySha3('access.role', 'owner', address);

    // Get initial role statuses
    let [senderIsOwner1, addressIsOwner1] = await Promise.all([
        rocketStorage.getBool.call(ownerSenderKey),
        rocketStorage.getBool.call(ownerAddressKey),
    ]);

    // Transfer
    await rocketRole.transferOwnership(address, txOptions);

    // Get updated role statuses
    let [senderIsOwner2, addressIsOwner2] = await Promise.all([
        rocketStorage.getBool.call(ownerSenderKey),
        rocketStorage.getBool.call(ownerAddressKey),
    ]);

    // Check statuses
    assert.isTrue(senderIsOwner1, 'Incorrect initial sender owner status');
    assert.isFalse(senderIsOwner2, 'Incorrect updated sender owner status');
    assert.isFalse(addressIsOwner1, 'Incorrect initial address owner status');
    assert.isTrue(addressIsOwner2, 'Incorrect updated address owner status');

}

