// Dependencies
import { RocketNodeAPI } from '../_lib/artifacts';


// Add a node
export async function scenarioAddNode({timezone, fromAddress, gas}) {
    const rocketNodeAPI = await RocketNodeAPI.deployed();

    // Add node
    let result = await rocketNodeAPI.add(timezone, {from: fromAddress, gas: gas});

    // Asserts
    assert.isTrue(
        result.logs.length > 0 &&
        result.logs[0].event == 'NodeAdd' &&
        result.logs[0].args.ID.toLowerCase() == fromAddress.toLowerCase(),
        'Node was not created successfully'
    );

}

