// Dependencies
import { RocketAdmin } from '../_lib/artifacts';


// Set node to trusted
export async function scenarioSetNodeTrusted({nodeAddress, trusted, fromAddress, gas}) {
    const rocketAdmin = await RocketAdmin.deployed();

    // Get initial trusted status
    let trusted1 = await rocketAdmin.getNodeTrusted.call(nodeAddress);

    // Set node trusted status
    await rocketAdmin.setNodeTrusted(nodeAddress, trusted, {from: fromAddress, gas: gas});

    // Get updated trusted status
    let trusted2 = await rocketAdmin.getNodeTrusted.call(nodeAddress);

    // Asserts
    assert.equal(trusted1, !trusted, 'Initial node trusted status was incorrect');
    assert.equal(trusted2, trusted, 'Node trusted status was not updated successfully');

}

