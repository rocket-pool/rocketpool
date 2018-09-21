// Dependencies
import { RocketGroupAPI, RocketGroupSettings } from '../_lib/artifacts';


// Add a group
export async function scenarioAddGroup({name, stakingFee, value, fromAddress, gas}) {
    const rocketGroupAPI = await RocketGroupAPI.deployed();
    const rocketGroupSettings = await RocketGroupSettings.deployed();

    // Get group creation fee address
    let feeAddress = await rocketGroupSettings.getNewFeeAddress();

    // Get initial group creation fee address balance
    let feeBalance1 = parseInt(await web3.eth.getBalance(feeAddress));

    // Add group
    let result = await rocketGroupAPI.add(name, stakingFee, {from: fromAddress, gas: gas, value: value});

    // Get updated group creation fee address balance
    let feeBalance2 = parseInt(await web3.eth.getBalance(feeAddress));

    // Asserts
    assert.equal(result.logs.filter(log => (log.event == 'GroupAdd')).length, 1, 'Group was not created successfully');
    assert.isTrue(feeBalance2 > feeBalance1, 'Creation fee balance was not transferred successfully');

}
