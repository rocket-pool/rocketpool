import { RocketUpgradeDistributor } from './artifacts';


export async function upgradeDistributor(guardian) {
  const rocketUpgradeDistributor = await RocketUpgradeDistributor.deployed();
  await rocketUpgradeDistributor.execute({ from: guardian });
}
