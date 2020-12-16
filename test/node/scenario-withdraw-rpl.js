import { RocketNodeStaking } from '../_utils/artifacts';


// Withdraw RPL staked against the node
export async function withdrawRpl(amount, txOptions) {

    // Load contracts
    const rocketNodeStaking = await RocketNodeStaking.deployed();

    // Stake RPL
    await rocketNodeStaking.withdrawRPL(amount, txOptions);

}

