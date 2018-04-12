import { soliditySha3, hashMessage } from '../utils';
import { RocketNodeAdmin, RocketNodeStatus, RocketNodeValidator } from '../artifacts';

// Registers node and asserts that number of registered nodes increased
export async function scenarioRegisterNode({
    nodeAddress,
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

    // Initialise add val code address
    if (!addValCodeAddress) addValCodeAddress = valCodeAddress;

    // Get initial node count
    let nodeCountOld = await rocketNodeAdmin.getNodeCount.call();

    // Sign the message for the nodeAdd function to prove ownership of the address being registered
    let message = valCodeAddress;
    let sigHash = hashMessage(message);    
    let signature =  web3.eth.sign(nodeAddress, message);
    
    // Register the node
    await rocketNodeAdmin.nodeAdd(nodeAddress, providerID, subnetID, instanceID, regionID, addValCodeAddress, sigHash, signature, {from: fromAddress, gas: gas});

    // Get updated node count
    let nodeCountNew = await rocketNodeAdmin.getNodeCount.call();

    // Assert that updated node count is correct
    assert.equal(nodeCountNew.valueOf(), parseInt(nodeCountOld.valueOf()) + 1, 'Invalid number of nodes registered');

}


// Performs node checkin and asserts that checkin was preformed successfully
export async function scenarioNodeCheckin({averageLoad, fromAddress}) {
    const rocketNodeStatus = await RocketNodeStatus.deployed();

    // Estimate gas required to launch pools
    let gasEstimate = await rocketNodeStatus.nodeCheckin.estimateGas(averageLoad, {from: fromAddress});

    // Check in
    let result = await rocketNodeStatus.nodeCheckin(averageLoad, {
        from: fromAddress,
        gas: parseInt(gasEstimate) + 100000,
    });

    // Assert NodeCheckin event was logged
    let log = result.logs.find(({ event }) => event == 'NodeCheckin');
    assert.notEqual(log, undefined, 'NodeCheckin event was not logged');

    // Get checkin details
    let checkinNodeAddress = log.args._nodeAddress.valueOf();
    let checkinLoadAverage = log.args.loadAverage.valueOf();

    // Check checkin details
    assert.equal(checkinNodeAddress, fromAddress, 'Checked in node address does not match');
    assert.notEqual(checkinLoadAverage, 0, 'Checked in load average is not correct');

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

// Casts a checkpoint vote with Casper
export async function scenarioNodeVoteCast({nodeAddress, epoch, minipoolAddress, voteMessage, gas}){
    const rocketNodeValidator = await RocketNodeValidator.deployed();

    // cast vote
    let result = await rocketNodeValidator.nodeVote(epoch, minipoolAddress, voteMessage.toString('hex'), {from: nodeAddress, gas: gas});

    let log = result.logs.find(({ event }) => event == 'NodeVoteCast');
    assert.isDefined(log, 'NodeVoteCast event was not logged');

    // check parameters were correct
    let recordedEpoch = log.args.epoch;
    assert.equal(recordedEpoch, epoch, 'The epoch that was voted for does not match');
    let recordedMiniPoolAddress = log.args.minipool_address;
    assert.equal(recordedMiniPoolAddress, minipoolAddress, 'The minipool address does not match');
    let recordedVoteMessage = log.args.vote_message;
    assert.equal(recordedVoteMessage, voteMessage, 'The vote message does not match');
}

