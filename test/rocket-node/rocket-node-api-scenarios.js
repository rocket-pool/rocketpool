// Dependencies
import { profileGasUsage } from '../_lib/utils/profiling';
import { RocketNodeAPI, RocketNodeContract } from '../_lib/artifacts';


// Add a node
export async function scenarioAddNode({timezone, fromAddress, gas}) {
    const rocketNodeAPI = await RocketNodeAPI.deployed();

    // Add node
    let result = await rocketNodeAPI.add(timezone, {from: fromAddress, gas: gas});
    profileGasUsage('RocketNodeAPI.add', result);

    // Get NodeAdd event
    let nodeAddEvents = result.logs.filter(log => (log.event == 'NodeAdd' && log.args.ID.toLowerCase() == fromAddress.toLowerCase()));
    let nodeAddContractAddress = (nodeAddEvents.length == 1 ? nodeAddEvents[0].args.contractAddress : null);

    // Get node contract address
    let nodeContractAddress = await rocketNodeAPI.getContract.call(fromAddress);

    // Initialise node contract and get details
    let nodeContract = await RocketNodeContract.at(nodeContractAddress);
    let nodeContractOwner = await nodeContract.getOwner.call();

    // Asserts
    assert.equal(nodeAddEvents.length, 1, 'Node was not created successfully');
    assert.equal(nodeContractAddress, nodeAddContractAddress, 'Node contract address is incorrect');
    assert.equal(nodeContractOwner, fromAddress, 'Node contract owner is incorrect');

}


// Set a node's timezone location
export async function scenarioSetTimezoneLocation({timezone, fromAddress, gas}) {
    const rocketNodeAPI = await RocketNodeAPI.deployed();

    // Set timezone location
    await rocketNodeAPI.setTimezoneLocation(timezone, {from: fromAddress, gas: gas});

    // Get timezone location
    let nodeTimezone = await rocketNodeAPI.getTimezoneLocation.call(fromAddress);

    // Asserts
    assert.equal(nodeTimezone, timezone, 'Node timezone location was not updated successfully');

}

