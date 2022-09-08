import { RocketUpgradeOneDotTwo } from './artifacts';


export async function upgradeOneDotTwo(guardian) {
  const rocketUpgradeOneDotTwo = await RocketUpgradeOneDotTwo.deployed();
  await rocketUpgradeOneDotTwo.execute({ from: guardian });
}

export async function upgradeExecuted() {
  const rocketUpgradeOneDotTwo = await RocketUpgradeOneDotTwo.deployed();
  return await rocketUpgradeOneDotTwo.executed();
}