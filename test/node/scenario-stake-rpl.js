import { RocketNodeStaking } from '../_utils/artifacts';


// Stake RPL against the node
export async function stakeRpl(amount, txOptions) {

    // Load contracts
    const rocketNodeStaking = await RocketNodeStaking.deployed();

    // Stake RPL
    await rocketNodeStaking.stakeRPL(amount, txOptions);

}

