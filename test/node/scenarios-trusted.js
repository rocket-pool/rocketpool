import { RocketNodeManager } from '../_utils/artifacts';


// Set a node's trusted status
export async function setNodeTrusted(nodeAddress, trusted, txOptions) {

    // Load contracts
    const rocketNodeManager = await RocketNodeManager.deployed();

    // Get initial trusted status
    let trusted1 = await rocketNodeManager.getNodeTrusted.call(nodeAddress);

    // Set trusted status
    await rocketNodeManager.setNodeTrusted(nodeAddress, trusted, txOptions);

    // Get updated trusted status
    let trusted2 = await rocketNodeManager.getNodeTrusted.call(nodeAddress);

    // Check statuses
    assert.notEqual(trusted1, trusted, 'Incorrect initial trusted status');
    assert.equal(trusted2, trusted, 'Incorrect updated trusted status');

}

