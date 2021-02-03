import { mineBlocks } from '../_utils/evm';
import { RocketTokenRPL, RocketDAOProtocol, RocketDAOProtocolSettingsRewards, RocketRewardsPool } from '../_utils/artifacts';


// Get the current rewards claim period in blocks
export async function rewardsClaimIntervalBlocksGet(txOptions) {
    // Load contracts
    const rocketDAOProtocolSettingsRewards = await RocketDAOProtocolSettingsRewards.deployed();
    return await rocketDAOProtocolSettingsRewards.getClaimIntervalBlocks.call();
};


// Get the current rewards claimers total
export async function rewardsClaimersPercTotalGet(txOptions) {
    // Load contracts
    const rocketDAOProtocolSettingsRewards = await RocketDAOProtocolSettingsRewards.deployed();
    return await rocketDAOProtocolSettingsRewards.getRewardsClaimersPercTotal.call();
};


// Get how many blocks needed until the next claim interval
export async function rewardsClaimIntervalsPassedGet(txOptions) {
    // Load contracts
    const rocketRewardsPool = await RocketRewardsPool.deployed();
    return await rocketRewardsPool.getClaimIntervalsPassed.call();
};







