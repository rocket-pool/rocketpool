import { RocketNetworkBalances } from '../_utils/artifacts';


// Get the network total ETH balance
export async function getTotalETHBalance() {
    const rocketNetworkBalances = await RocketNetworkBalances.deployed();
    let balance = await rocketNetworkBalances.getTotalETHBalance.call();
    return balance;
}


// Update the network total ETH balance
export async function updateTotalETHBalance(balance, txOptions) {
    const rocketNetworkBalances = await RocketNetworkBalances.deployed();
    await rocketNetworkBalances.updateTotalETHBalance(balance, txOptions);
}

