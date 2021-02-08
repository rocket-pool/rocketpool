import { RocketNodeManager } from '../_utils/artifacts';


// Set a node's withdrawal address
export async function setWithdrawalAddress(withdrawalAddress, txOptions) {

    // Load contracts
    const rocketNodeManager = await RocketNodeManager.deployed();

    // Set withdrawal address
    await rocketNodeManager.setWithdrawalAddress(withdrawalAddress, txOptions);

    // Get withdrawal address
    let nodeWithdrawalAddress = await rocketNodeManager.getNodeWithdrawalAddress.call(txOptions.from);

    // Check
    assert.equal(nodeWithdrawalAddress, withdrawalAddress, 'Incorrect updated withdrawal address');

}

