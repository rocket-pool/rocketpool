// Dependencies
import { profileGasUsage } from '../_lib/utils/profiling';
import { RocketNodeAPI } from '../_lib/artifacts';


// Add a node
export async function scenarioAddNode({timezone, fromAddress, gas}) {
    const rocketNodeAPI = await RocketNodeAPI.deployed();

    // Add node
    let result = await rocketNodeAPI.add(timezone, {from: fromAddress, gas: gas});
    profileGasUsage('RocketNodeAPI.add', result);

    // Asserts
    assert.equal(
        result.logs.filter(log => (log.event == 'NodeAdd' && log.args.ID.toLowerCase() == fromAddress.toLowerCase())).length, 1,
        'Node was not created successfully'
    );

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

