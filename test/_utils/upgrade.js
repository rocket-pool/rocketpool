import { RocketUpgradeOneDotOne } from './artifacts';


export async function upgradeOneDotOne(guardian) {
  const rocketUpgradeOneDotOne = await RocketUpgradeOneDotOne.deployed();
  await rocketUpgradeOneDotOne.execute({ from: guardian });
}

export async function upgradeExecuted() {
  const rocketUpgradeOneDotOne = await RocketUpgradeOneDotOne.deployed();
  return await rocketUpgradeOneDotOne.executed();
}