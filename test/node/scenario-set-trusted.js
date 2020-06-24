import { RocketNodeManager } from '../_utils/artifacts';


// Set a node's trusted status
export async function setNodeTrusted(nodeAddress, trusted, txOptions) {

    // Load contracts
    const rocketNodeManager = await RocketNodeManager.deployed();

    // Get initial trusted node index & node status
    let trustedCount1 = await rocketNodeManager.getTrustedNodeCount.call();
    let trusted1 = await rocketNodeManager.getNodeTrusted.call(nodeAddress);

    // Set trusted status
    await rocketNodeManager.setNodeTrusted(nodeAddress, trusted, txOptions);

    // Get updated trusted node index & node status
    let trustedCount2 = await rocketNodeManager.getTrustedNodeCount.call();
    let lastTrustedAddress = await rocketNodeManager.getTrustedNodeAt.call(trustedCount2.sub(web3.utils.toBN(1)));
    let trusted2 = await rocketNodeManager.getNodeTrusted.call(nodeAddress);

    // Check trusted node index
    if (trusted) {
        assert(trustedCount2.eq(trustedCount1.add(web3.utils.toBN(1))), 'Incorrect updated trusted node count');
        assert.equal(lastTrustedAddress, nodeAddress, 'Incorrect updated trusted node index');
    } else {
        assert(trustedCount2.eq(trustedCount1.sub(web3.utils.toBN(1))), 'Incorrect updated trusted node count');
    }

    // Check node status
    assert.notEqual(trusted1, trusted, 'Incorrect initial trusted status');
    assert.equal(trusted2, trusted, 'Incorrect updated trusted status');

}

