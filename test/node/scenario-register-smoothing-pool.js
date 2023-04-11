import { RocketNodeManager, RocketNodeManagerOld } from '../_utils/artifacts';
import { upgradeExecuted } from '../_utils/upgrade';


// Register a node
export async function setSmoothingPoolRegistrationState(state, txOptions) {
    // Load contracts
    const rocketNodeManager = await upgradeExecuted() ? await RocketNodeManager.deployed() : await RocketNodeManagerOld.deployed();

    // Register
    await rocketNodeManager.setSmoothingPoolRegistrationState(state, txOptions);

    // Check details
    const newState = await rocketNodeManager.getSmoothingPoolRegistrationState(txOptions.from);
    assert.strictEqual(newState, state, 'Incorrect smoothing pool registration state');
}
