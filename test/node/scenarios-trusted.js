import { RocketNodeManager } from '../_utils/artifacts';


// Set a node's trusted status
export async function setNodeTrusted(nodeAddress, trusted, txOptions) {

    // Load contracts
    const rocketNodeManager = await RocketNodeManager.deployed();

    // Set trusted status
    await rocketNodeManager.setNodeTrusted(nodeAddress, trusted, txOptions);

}

