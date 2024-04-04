import { RocketNodeManager, RocketNodeManagerNew } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';
import { upgradeExecuted } from '../_utils/upgrade';


// Register a node
export async function register(timezoneLocation, txOptions) {

    // Load contracts
    const rocketNodeManager = await upgradeExecuted() ? await RocketNodeManagerNew.deployed() : await RocketNodeManager.deployed();

    // Get node details
    function getNodeDetails(nodeAddress) {
        return Promise.all([
            rocketNodeManager.getNodeExists.call(nodeAddress),
            rocketNodeManager.getNodeTimezoneLocation.call(nodeAddress),
        ]).then(
            ([exists, timezoneLocation]) =>
            ({exists, timezoneLocation})
        );
    }

    // Get initial node index
    let nodeCount1 = await rocketNodeManager.getNodeCount.call();

    // Register
    await rocketNodeManager.registerNode(timezoneLocation, txOptions);

    // Get updated node index & node details
    let nodeCount2 = await rocketNodeManager.getNodeCount.call();
    let [lastNodeAddress, details] = await Promise.all([
        rocketNodeManager.getNodeAt.call(nodeCount2.sub('1'.BN)),
        getNodeDetails(txOptions.from),
    ]);

    // Check details
    assertBN.equal(nodeCount2, nodeCount1.add('1'.BN), 'Incorrect updated node count');
    assert.strictEqual(lastNodeAddress, txOptions.from, 'Incorrect updated node index');
    assert.isTrue(details.exists, 'Incorrect node exists flag');
    assert.strictEqual(details.timezoneLocation, timezoneLocation, 'Incorrect node timezone location');
}
