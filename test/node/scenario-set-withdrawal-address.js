import { RocketStorage } from '../../test/_utils/artifacts';
import * as assert from 'assert';

// Set a node's withdrawal address
export async function setWithdrawalAddress(nodeAddress, withdrawalAddress, confirm, txOptions) {
    // Load contracts
    const rocketStorage = await RocketStorage.deployed();

    // Set withdrawal address
    await rocketStorage.connect(txOptions.from).setWithdrawalAddress(nodeAddress, withdrawalAddress, confirm, txOptions);

    // Get current & pending withdrawal addresses
    let nodeWithdrawalAddress = await rocketStorage.getNodeWithdrawalAddress(nodeAddress);
    let nodePendingWithdrawalAddress = await rocketStorage.getNodePendingWithdrawalAddress(nodeAddress);

    // Confirmed update check
    if (confirm) {
        assert.strictEqual(nodeWithdrawalAddress, withdrawalAddress, 'Incorrect updated withdrawal address');
    }

    // Unconfirmed update check
    else {
        assert.strictEqual(nodePendingWithdrawalAddress, withdrawalAddress, 'Incorrect updated pending withdrawal address');
    }
}

// Confirm a node's net withdrawal address
export async function confirmWithdrawalAddress(nodeAddress, txOptions) {
    // Load contracts
    const rocketStorage = await RocketStorage.deployed();

    // Confirm withdrawal address
    await rocketStorage.connect(txOptions.from).confirmWithdrawalAddress(nodeAddress, txOptions);

    // Get current & pending withdrawal addresses
    let nodeWithdrawalAddress = await rocketStorage.getNodeWithdrawalAddress(nodeAddress);
    let nodePendingWithdrawalAddress = await rocketStorage.getNodePendingWithdrawalAddress(nodeAddress);

    // Check
    assert.strictEqual(nodeWithdrawalAddress, txOptions.from.address, 'Incorrect updated withdrawal address');
    assert.strictEqual(nodePendingWithdrawalAddress, '0x0000000000000000000000000000000000000000', 'Incorrect pending withdrawal address');
}
