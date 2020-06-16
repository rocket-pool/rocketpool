import { RocketNodeETHToken } from '../_utils/artifacts';


// Burn nETH for ETH
export async function burnNeth(amount, txOptions) {

    // Load contracts
    const rocketNodeETHToken = await RocketNodeETHToken.deployed();

    // Burn tokens
    await rocketNodeETHToken.burn(amount, txOptions);

}

