import { RocketUpgradeOneDotThree } from './artifacts';

export async function upgradeOneDotThree(guardian) {
    const rocketUpgradeOneDotThree = await RocketUpgradeOneDotThree.deployed();
    await rocketUpgradeOneDotThree.execute({ from: guardian });
}

export async function upgradeExecuted() {
    const rocketUpgradeOneDotThree = await RocketUpgradeOneDotThree.deployed();
    return await rocketUpgradeOneDotThree.executed();
}