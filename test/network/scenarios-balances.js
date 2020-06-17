import { RocketNetworkBalances } from '../_utils/artifacts';


// Update the network ETH balances
export async function updateETHBalances(epoch, total, staking, txOptions) {

    // Load contracts
    const rocketNetworkBalances = await RocketNetworkBalances.deployed();

    // Update balance
    await rocketNetworkBalances.updateETHBalances(epoch, total, staking, txOptions);

}

