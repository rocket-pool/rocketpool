const hre = require('hardhat');
const ethers = hre.ethers;

export const beaconGenesisTime = 1606824023;
export const secondsPerSlot = 12;
export const slotsPerEpoch = 32;

export async function getSlotForBlock(blockNumber = null) {
    const latestBlock = await ethers.provider.getBlock(blockNumber || 'latest');
    const currentTime = latestBlock.timestamp;

    return Math.floor((currentTime - beaconGenesisTime) / secondsPerSlot);
}

export async function getCurrentEpoch() {
    const slotsPassed = await getSlotForBlock('latest');
    return Math.floor(slotsPassed / slotsPerEpoch);
}
