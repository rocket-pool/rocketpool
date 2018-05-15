import { soliditySha3, hashMessage }  from '../../_lib/utils/general';
import { RocketNodeAdmin }  from '../../_lib/artifacts';

// Registers node and asserts that number of registered nodes increased
export async function scenarioRegisterNode({
    nodeAddress,
    signNodeAddress = null,
    valCodeAddress,
    addValCodeAddress = null,
    providerID,
    subnetID,
    instanceID,
    regionID,
    fromAddress,
    gas
}) {
    const rocketNodeAdmin = await RocketNodeAdmin.deployed();

    // Initialise addresses
    if (!addValCodeAddress) addValCodeAddress = valCodeAddress;
    if (!signNodeAddress) signNodeAddress = nodeAddress;

    // Get initial node count
    let nodeCountOld = await rocketNodeAdmin.getNodeCount.call();

    // Sign the message for the nodeAdd function to prove ownership of the address being registered
    let message = valCodeAddress;
    let sigHash = hashMessage(message);    
    let signature =  web3.eth.sign(signNodeAddress, message);
    
    // Register the node
    await rocketNodeAdmin.nodeAdd(nodeAddress, providerID, subnetID, instanceID, regionID, addValCodeAddress, sigHash, signature, {from: fromAddress, gas: gas});

    // Get updated node count
    let nodeCountNew = await rocketNodeAdmin.getNodeCount.call();

    // Assert that updated node count is correct
    assert.equal(nodeCountNew.valueOf(), parseInt(nodeCountOld.valueOf()) + 1, 'Invalid number of nodes registered');

}

// Removes a node and asserts that node was removed successfully
export async function scenarioRemoveNode({nodeAddress, fromAddress, gas}) {
    const rocketNodeAdmin = await RocketNodeAdmin.deployed();

    // Remove the node
    let result = await rocketNodeAdmin.nodeRemove(nodeAddress, {from: fromAddress, gas: gas});

    // Check that removal event was logged
    let log = result.logs.find(({ event }) => event == 'NodeRemoved');
    assert.notEqual(log, undefined, 'NodeRemoved event was not logged');

    // Check that removed node address matches
    let removedNodeAddress = log.args._address;
    assert.equal(removedNodeAddress, nodeAddress, 'Removed node address does not match');

}