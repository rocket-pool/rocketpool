// Dependencies
import { RocketDepositIndex } from '../_lib/artifacts';


// Get a user's queued deposit IDs
export async function getQueuedDepositIDs({groupID, userID, durationID}) {
    const rocketDepositIndex = await RocketDepositIndex.deployed();
    let depositCount = parseInt(await rocketDepositIndex.getUserQueuedDepositCount.call(groupID, userID, durationID));
    let depositIDs = [], di;
    for (di = 0; di < depositCount; ++di) depositIDs.push(await rocketDepositIndex.getUserQueuedDepositAt.call(groupID, userID, durationID, di));
    return depositIDs;
}


// Make a user deposit
export async function userDeposit({depositorContract, durationID, fromAddress, value}) {
    await depositorContract.deposit(durationID, {from: fromAddress, value: value});
}

