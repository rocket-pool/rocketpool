import { RocketNodeManager } from '../_utils/artifacts';


// Register a node
export async function registerNode(timezoneLocation, txOptions) {

    // Load contracts
    const rocketNodeManager = await RocketNodeManager.deployed();

    // Register
    await rocketNodeManager.registerNode(timezoneLocation, txOptions);

}

