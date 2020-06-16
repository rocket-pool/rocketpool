import { RocketETHToken, RocketNodeETHToken } from '../_utils/artifacts';


// Burn rETH for ETH
export async function burnReth(amount, txOptions) {

    // Load contracts
    const rocketETHToken = await RocketETHToken.deployed();

    // Burn tokens
    await rocketETHToken.burn(amount, txOptions);

}


// Burn nETH for ETH
export async function burnNeth(amount, txOptions) {

    // Load contracts
    const rocketNodeETHToken = await RocketNodeETHToken.deployed();

    // Burn tokens
    await rocketNodeETHToken.burn(amount, txOptions);

}

