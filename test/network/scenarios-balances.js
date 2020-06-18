import { RocketNetworkBalances } from '../_utils/artifacts';


// Submit network ETH balances
export async function submitETHBalances(epoch, total, staking, txOptions) {

    // Load contracts
    const rocketNetworkBalances = await RocketNetworkBalances.deployed();

    // Submit balance
    await rocketNetworkBalances.submitETHBalances(epoch, total, staking, txOptions);

}

