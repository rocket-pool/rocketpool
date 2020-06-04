import { RocketPool } from '../_utils/artifacts';


// Get the network total ETH balance
export async function getTotalETHBalance() {
    const rocketPool = await RocketPool.deployed();
    let balance = await rocketPool.getTotalETHBalance.call();
    return balance;
}


// Update the network total ETH balance
export async function updateTotalETHBalance(balance, txOptions) {
    const rocketPool = await RocketPool.deployed();
    await rocketPool.updateTotalETHBalance(balance, txOptions);
}

