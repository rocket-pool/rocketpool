// Dependencies
import { RocketDepositAPI } from '../_lib/artifacts';


// Get a user's queued deposit IDs
export async function getQueuedDepositIDs({groupID, userID, durationID}) {
    const rocketDepositAPI = await RocketDepositAPI.deployed();
    let depositCount = parseInt(await rocketDepositAPI.getUserQueuedDepositCount.call(groupID, userID, durationID));
    let depositIDs = [], di;
    for (di = 0; di < depositCount; ++di) depositIDs.push(await rocketDepositAPI.getUserQueuedDepositAt.call(groupID, userID, durationID, di));
    return depositIDs;
}

