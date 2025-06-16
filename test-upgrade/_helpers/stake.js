import { RocketNodeStaking, RocketTokenRPL } from '../../test/_utils/artifacts';

export async function stakeRPL(node, amount) {
    const rocketNodeStaking = await RocketNodeStaking.deployed();
    const rocketTokenRPL = await RocketTokenRPL.deployed();

    await rocketTokenRPL.connect(node).approve(rocketNodeStaking.target, amount);
    await rocketNodeStaking.connect(node).stakeRPL(amount);
}