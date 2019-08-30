// Dependencies
import { RocketPoolToken } from '../_lib/artifacts';


// Mint RPL to an address
export async function mintRpl({toAddress, rplAmount, fromAddress}) {

    // Mint RPL
    // TODO: Remove hex encoding when web3 AbiCoder bug is fixed
    let rocketPoolToken = await RocketPoolToken.deployed();
    await rocketPoolToken.mint(toAddress, web3.utils.numberToHex(rplAmount), {from: fromAddress});

}

