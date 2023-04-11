import { RocketNodeManager, RocketStorage } from '../_utils/artifacts'


// Set a node's withdrawal address
export async function setWithdrawalAddress(nodeAddress, withdrawalAddress, confirm, txOptions) {
    // Load contracts
    const rocketStorage = await RocketStorage.deployed();

    // Set withdrawal address
    await rocketStorage.setWithdrawalAddress(nodeAddress, withdrawalAddress, confirm, txOptions);

    // Get current & pending withdrawal addresses
    let nodeWithdrawalAddress = await rocketStorage.getNodeWithdrawalAddress.call(nodeAddress);
    let nodePendingWithdrawalAddress = await rocketStorage.getNodePendingWithdrawalAddress.call(nodeAddress);

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
    await rocketStorage.confirmWithdrawalAddress(nodeAddress, txOptions);

    // Get current & pending withdrawal addresses
    let nodeWithdrawalAddress = await rocketStorage.getNodeWithdrawalAddress.call(nodeAddress);
    let nodePendingWithdrawalAddress = await rocketStorage.getNodePendingWithdrawalAddress.call(nodeAddress);

    // Check
    assert.strictEqual(nodeWithdrawalAddress, txOptions.from, 'Incorrect updated withdrawal address');
    assert.strictEqual(nodePendingWithdrawalAddress, '0x0000000000000000000000000000000000000000', 'Incorrect pending withdrawal address');
}
