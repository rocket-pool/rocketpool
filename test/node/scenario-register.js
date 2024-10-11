import { RocketNodeManager } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';
import * as assert from 'assert';

// Register a node
export async function register(timezoneLocation, txOptions) {
    // Load contracts
    const rocketNodeManager = await RocketNodeManager.deployed();

    // Get node details
    function getNodeDetails(nodeAddress) {
        return Promise.all([
            rocketNodeManager.getNodeExists(nodeAddress),
            rocketNodeManager.getNodeTimezoneLocation(nodeAddress),
        ]).then(
            ([exists, timezoneLocation]) =>
                ({ exists, timezoneLocation }),
        );
    }

    // Get initial node index
    let nodeCount1 = await rocketNodeManager.getNodeCount();

    // Register
    await rocketNodeManager.connect(txOptions.from).registerNode(timezoneLocation, txOptions);

    // Get updated node index & node details
    let nodeCount2 = await rocketNodeManager.getNodeCount();
    let [lastNodeAddress, details] = await Promise.all([
        rocketNodeManager.getNodeAt(nodeCount2 - 1n),
        getNodeDetails(txOptions.from.address),
    ]);

    // Check details
    assertBN.equal(nodeCount2, nodeCount1 + 1n, 'Incorrect updated node count');
    assert.strictEqual(lastNodeAddress, txOptions.from.address, 'Incorrect updated node index');
    assert.equal(details.exists, true, 'Incorrect node exists flag');
    assert.strictEqual(details.timezoneLocation, timezoneLocation, 'Incorrect node timezone location');
}
