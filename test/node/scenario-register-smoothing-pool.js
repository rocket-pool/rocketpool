import { RocketNodeManager } from '../_utils/artifacts';
import * as assert from 'assert';

// Register a node
export async function setSmoothingPoolRegistrationState(state, txOptions) {
    // Load contracts
    const rocketNodeManager = await RocketNodeManager.deployed();

    // Register
    await rocketNodeManager.connect(txOptions.from).setSmoothingPoolRegistrationState(state, txOptions);

    // Check details
    const newState = await rocketNodeManager.getSmoothingPoolRegistrationState(txOptions.from.address);
    assert.strictEqual(newState, state, 'Incorrect smoothing pool registration state');
}
