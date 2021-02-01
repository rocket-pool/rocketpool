import { mineBlocks } from '../_utils/evm';
import { RocketTokenRPL, RocketDAONetwork, RocketDAONetworkSettingsRewards, RocketRewardsPool } from '../_utils/artifacts';


// Get the current rewards claim period in blocks
export async function rewardsClaimIntervalBlocksGet(txOptions) {
    // Load contracts
    const rocketDAONetworkSettingsRewards = await RocketDAONetworkSettingsRewards.deployed();
    return await rocketDAONetworkSettingsRewards.getClaimIntervalBlocks.call();
};


// Get the current rewards claimers total
export async function rewardsClaimersPercTotalGet(txOptions) {
    // Load contracts
    const rocketDAONetworkSettingsRewards = await RocketDAONetworkSettingsRewards.deployed();
    return await rocketDAONetworkSettingsRewards.getRewardsClaimersPercTotal.call();
};


// Get how many blocks needed until the next claim interval
export async function rewardsClaimIntervalsPassedGet(txOptions) {
    // Load contracts
    const rocketRewardsPool = await RocketRewardsPool.deployed();
    return await rocketRewardsPool.getClaimIntervalsPassed.call();
};







