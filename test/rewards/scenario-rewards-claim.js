import { RocketDAOProtocolSettingsRewards, RocketRewardsPool } from '../_utils/artifacts';


// Get the current rewards claim period in blocks
export async function rewardsClaimIntervalTimeGet(txOptions) {
  // Load contracts
  const rocketDAOProtocolSettingsRewards = await RocketDAOProtocolSettingsRewards.deployed();
  return await rocketDAOProtocolSettingsRewards.getClaimIntervalTime.call();
}


// Get the current rewards claimers total
export async function rewardsClaimersPercTotalGet(txOptions) {
  // Load contracts
  const rocketDAOProtocolSettingsRewards = await RocketDAOProtocolSettingsRewards.deployed();
  return await rocketDAOProtocolSettingsRewards.getRewardsClaimersPercTotal.call();
}


// Get how many seconds needed until the next claim interval
export async function rewardsClaimIntervalsPassedGet(txOptions) {
  // Load contracts
  const rocketRewardsPool = await RocketRewardsPool.deployed();
  return await rocketRewardsPool.getClaimIntervalsPassed.call();
}
