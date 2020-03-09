// Dependencies
import { RocketAdmin, RocketDepositIndex, RocketNodeAPI, RocketNodeWatchtower } from '../_lib/artifacts';
import { getWithdrawalPubkey, getWithdrawalCredentials } from '../_lib/utils/beacon';


// Set the Rocket Pool withdrawal key & credentials
export async function setRocketPoolWithdrawalKey({nodeOperator, owner}) {

    // Register node
    let rocketNodeAPI = await RocketNodeAPI.deployed();
    await rocketNodeAPI.add('Australia/Brisbane', {from: nodeOperator});

    // Set node status
    let rocketAdmin = await RocketAdmin.deployed();
    await rocketAdmin.setNodeTrusted(nodeOperator, true, {from: owner});

    // Set withdrawal credentials
    let rocketNodeWatchtower = await RocketNodeWatchtower.deployed();
    await rocketNodeWatchtower.updateWithdrawalKey(getWithdrawalPubkey(), getWithdrawalCredentials(), {from: nodeOperator});

}


// Get a user's queued deposit IDs
export async function getQueuedDepositIDs({groupID, userID, durationID}) {
    const rocketDepositIndex = await RocketDepositIndex.deployed();
    let depositCount = parseInt(await rocketDepositIndex.getUserQueuedDepositCount.call(groupID, userID, durationID));
    let depositIDs = [], di;
    for (di = 0; di < depositCount; ++di) depositIDs.push(await rocketDepositIndex.getUserQueuedDepositAt.call(groupID, userID, durationID, di));
    return depositIDs;
}


// Get all of a user's deposit IDs
export async function getDepositIDs({groupID, userID, durationID}) {
	const rocketDepositIndex = await RocketDepositIndex.deployed();
	let depositCount = parseInt(await rocketDepositIndex.getUserDepositCount.call(groupID, userID, durationID));
    let depositIDs = [], di;
    for (di = 0; di < depositCount; ++di) depositIDs.push(await rocketDepositIndex.getUserDepositAt.call(groupID, userID, durationID, di));
    return depositIDs;
}


// Make a user deposit
export async function userDeposit({depositorContract, durationID, fromAddress, value}) {
    await depositorContract.deposit(durationID, {from: fromAddress, value: value});
}


// Withdraw a user deposit from a withdrawn minipool
export async function userWithdrawMinipoolDeposit({withdrawerContract, depositID, minipoolAddress, userAddress}) {
	await withdrawerContract.depositWithdrawMinipool(depositID, minipoolAddress, {from: userAddress});
}

