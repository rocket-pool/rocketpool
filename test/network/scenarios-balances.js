import { RocketNetworkBalances } from '../_utils/artifacts';


// Update the total network ETH balance
export async function updateTotalETHBalance(balance, txOptions) {

    // Load contracts
    const rocketNetworkBalances = await RocketNetworkBalances.deployed();

    // Update balance
    await rocketNetworkBalances.updateTotalETHBalance(balance, txOptions);

}


// Update the staking network ETH balance
export async function updateStakingETHBalance(balance, txOptions) {

    // Load contracts
    const rocketNetworkBalances = await RocketNetworkBalances.deployed();

    // Update balance
    await rocketNetworkBalances.updateStakingETHBalance(balance, txOptions);

}

