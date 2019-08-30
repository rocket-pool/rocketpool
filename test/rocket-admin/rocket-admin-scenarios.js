// Dependencies
import { RocketAdmin, RocketGroupContract, RocketNodeAPI } from '../_lib/artifacts';


// Set node to trusted
export async function scenarioSetNodeTrusted({nodeAddress, trusted, fromAddress, gas}) {
    const rocketAdmin = await RocketAdmin.deployed();
    const rocketNodeAPI = await RocketNodeAPI.deployed();

    // Get initial trusted status
    let trusted1 = await rocketNodeAPI.getTrusted.call(nodeAddress);

    // Set node trusted status
    await rocketAdmin.setNodeTrusted(nodeAddress, trusted, {from: fromAddress, gas: gas});

    // Get updated trusted status
    let trusted2 = await rocketNodeAPI.getTrusted.call(nodeAddress);

    // Asserts
    assert.equal(trusted1, !trusted, 'Initial node trusted status was incorrect');
    assert.equal(trusted2, trusted, 'Node trusted status was not updated successfully');

}


// Set group RP fee percentage
export async function scenarioSetGroupRocketPoolFeePercent({groupId, feePerc, fromAddress, gas}) {
    const rocketAdmin = await RocketAdmin.deployed();

    // Set group RP fee percentage
    await rocketAdmin.setGroupRocketPoolFeePercent(groupId, feePerc, {from: fromAddress, gas: gas});

    // Get updated group RP fee percentage
    let group = await RocketGroupContract.at(groupId);
    let groupFeePerc = parseInt(await group.getFeePercRocketPool.call());

    // Asserts
    assert.equal(groupFeePerc, parseInt(feePerc), 'Group RP fee percentage was not updated successfully');

}

