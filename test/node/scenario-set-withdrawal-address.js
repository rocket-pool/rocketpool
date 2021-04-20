import { RocketNodeManager } from '../_utils/artifacts';


// Set a node's withdrawal address
export async function setWithdrawalAddress(withdrawalAddress, confirm, txOptions) {

    // Load contracts
    const rocketNodeManager = await RocketNodeManager.deployed();

    // Get node address
    let nodeAddress = await rocketNodeManager.getNodeByWithdrawalAddress.call(txOptions.from);

    // Set withdrawal address
    await rocketNodeManager.setWithdrawalAddress(withdrawalAddress, confirm, txOptions);

    // Get node by current/pending withdrawal address
    let nodeByWithdrawalAddress = await rocketNodeManager.getNodeByWithdrawalAddress.call(withdrawalAddress);
    let nodeByPendingWithdrawalAddress = await rocketNodeManager.getNodeByPendingWithdrawalAddress.call(withdrawalAddress);

    // Get current & pending withdrawal addresses
    let nodeWithdrawalAddress = await rocketNodeManager.getNodeWithdrawalAddress.call(nodeAddress);
    let nodePendingWithdrawalAddress = await rocketNodeManager.getNodePendingWithdrawalAddress.call(nodeAddress);

    // Confirmed update check
    if (confirm) {
        assert.equal(nodeByWithdrawalAddress, nodeAddress, 'Incorrect node by withdrawal address');
        assert.equal(nodeWithdrawalAddress, withdrawalAddress, 'Incorrect updated withdrawal address');
    }

    // Unconfirmed update check
    else {
        assert.equal(nodeByPendingWithdrawalAddress, nodeAddress, 'Incorrect node by pending withdrawal address');
        assert.equal(nodePendingWithdrawalAddress, withdrawalAddress, 'Incorrect updated pending withdrawal address');
    }

}


// Confirm a node's net withdrawal address
export async function confirmWithdrawalAddress(txOptions) {

    // Load contracts
    const rocketNodeManager = await RocketNodeManager.deployed();

    // Get node address
    let nodeAddress = await rocketNodeManager.getNodeByPendingWithdrawalAddress.call(txOptions.from);

    // Confirm withdrawal address
    await rocketNodeManager.confirmWithdrawalAddress(txOptions);

    // Get node by withdrawal address & node withdrawal address
    let nodeByWithdrawalAddress = await rocketNodeManager.getNodeByWithdrawalAddress.call(txOptions.from);
    let nodeWithdrawalAddress = await rocketNodeManager.getNodeWithdrawalAddress.call(nodeAddress);

    // Check
    assert.equal(nodeByWithdrawalAddress, nodeAddress, 'Incorrect node by withdrawal address');
    assert.equal(nodeWithdrawalAddress, txOptions.from, 'Incorrect updated withdrawal address');

}

