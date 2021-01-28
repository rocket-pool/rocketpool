import { mineBlocks } from '../_utils/evm';
import { RocketTokenRPL, RocketDAONetwork, RocketDAONetworkSettings, RocketRewardsPool } from '../_utils/artifacts';


// Get the current rewards claim period in blocks
export async function rewardsClaimIntervalBlocksGet(txOptions) {
    // Load contracts
    const rocketDAONetworkSettings = await RocketDAONetworkSettings.deployed();
    return await rocketDAONetworkSettings.getClaimIntervalBlocks.call();
};


// Get the current rewards claimers total
export async function rewardsClaimersPercTotalGet(txOptions) {
    // Load contracts
    const rocketDAONetworkSettings = await RocketDAONetworkSettings.deployed();
    return await rocketDAONetworkSettings.getRewardsClaimersPercTotal.call();
};


// Get how many blocks needed until the next claim interval
export async function rewardsClaimIntervalsPassedGet(txOptions) {
    // Load contracts
    const rocketRewardsPool = await RocketRewardsPool.deployed();
    return await rocketRewardsPool.getClaimIntervalsPassed.call();
};







