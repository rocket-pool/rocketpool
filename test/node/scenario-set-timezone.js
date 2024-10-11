import { RocketNodeManager } from '../../test/_utils/artifacts';
import * as assert from 'assert';

// Set a node's timezone location
export async function setTimezoneLocation(timezoneLocation, txOptions) {
    // Load contracts
    const rocketNodeManager = await RocketNodeManager.deployed();

    // Set timezone location
    await rocketNodeManager.connect(txOptions.from).setTimezoneLocation(timezoneLocation, txOptions);

    // Get timezone location
    let nodeTimezoneLocation = await rocketNodeManager.getNodeTimezoneLocation(txOptions.from.address);

    // Check
    assert.strictEqual(nodeTimezoneLocation, timezoneLocation, 'Incorrect updated timezone location');
}
