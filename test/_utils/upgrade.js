import { RocketUpgradeRewards } from './artifacts';


export async function upgradeRewards(guardian) {
  const rocketUpgradeDistributor = await RocketUpgradeRewards.deployed();
  await rocketUpgradeDistributor.execute({ from: guardian });
}
