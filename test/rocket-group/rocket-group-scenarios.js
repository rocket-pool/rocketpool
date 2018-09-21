// Dependencies
import { RocketGroupAPI } from '../_lib/artifacts';


// Add a group
export async function scenarioAddGroup({name, stakingFee, value, fromAddress, gas}) {
    const rocketGroupAPI = await RocketGroupAPI.deployed();

    // Add group
    let result = await rocketGroupAPI.add(name, stakingFee, {from: fromAddress, gas: gas, value: value});

}
