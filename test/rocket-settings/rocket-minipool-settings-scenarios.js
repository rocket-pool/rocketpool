// Dependencies
import { RocketMinipoolSettings } from '../_lib/artifacts';


// Add a staking duration
export async function scenarioAddStakingDuration({durationId, epochs, fromAddress, gas}) {
    const rocketMinipoolSettings = await RocketMinipoolSettings.deployed();

    // Add staking duration
    await rocketMinipoolSettings.addMinipoolStakingDuration(durationId, epochs, {from: fromAddress, gas: gas});

    // Check staking duration exists
    let durationExists = await rocketMinipoolSettings.getMinipoolStakingDurationExists(durationId);
    assert.isTrue(durationExists, 'Staking duration was not created successfully');

}


// Set a staking duration's epoch count
export async function scenarioSetStakingDurationEpochs({durationId, epochs, fromAddress, gas}) {
    const rocketMinipoolSettings = await RocketMinipoolSettings.deployed();

    // Update staking duration
    await rocketMinipoolSettings.setMinipoolStakingDurationEpochs(durationId, epochs, {from: fromAddress, gas: gas});

    // Check staking duration epochs
    let durationEpochs = parseInt(await rocketMinipoolSettings.getMinipoolStakingDurationEpochs(durationId));
    assert.equal(durationEpochs, epochs, 'Staking duration epoch count was not set successfully');

}


// Set a staking duration's enabled status
export async function scenarioSetStakingDurationEnabled({durationId, enabled, fromAddress, gas}) {
    const rocketMinipoolSettings = await RocketMinipoolSettings.deployed();

    // Update staking duration
    await rocketMinipoolSettings.setMinipoolStakingDurationEnabled(durationId, enabled, {from: fromAddress, gas: gas});

    // Check staking duration settings
    let durationEnabled = await rocketMinipoolSettings.getMinipoolStakingDurationEnabled(durationId);
    assert.equal(durationEnabled, enabled, 'Staking duration enabled status was not set successfully');

}

