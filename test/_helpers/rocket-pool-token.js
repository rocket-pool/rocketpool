// Dependencies
import { RocketPoolToken } from '../_lib/artifacts';


// Mint RPL to an address
export async function mintRpl({toAddress, rplAmount, fromAddress}) {

    // Mint RPL
    let rocketPoolToken = await RocketPoolToken.deployed();
    await rocketPoolToken.mint(toAddress, rplAmount, {from: fromAddress, gas: 500000});

}

