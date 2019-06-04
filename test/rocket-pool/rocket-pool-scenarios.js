// Dependencies
import { RocketPool } from '../_lib/artifacts';


// Get a contract address
export async function scenarioGetContractAddress(name) {
    const rocketPool = await RocketPool.deployed();

    // Get & return address
    let address = await rocketPool.getContractAddress(name);
    return address;

}


// Create minipool directly
export async function scenarioCreateMinipool({nodeOwner, durationID, validatorPubkey, validatorSignature, etherAmount, rplAmount, isTrusted, fromAddress, gas}) {
    const rocketPool = await RocketPool.deployed();

    // Create minipool
    await rocketPool.minipoolCreate(nodeOwner, durationID, validatorPubkey, validatorSignature, etherAmount, rplAmount, isTrusted, {from: fromAddress, gas: gas});

}


// Remove minipool directly
export async function scenarioRemoveMinipool({fromAddress, gas}) {
    const rocketPool = await RocketPool.deployed();

    // Remove minipool
    await rocketPool.minipoolRemove({from: fromAddress, gas: gas});

}

