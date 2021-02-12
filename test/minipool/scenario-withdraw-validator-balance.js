import {  } from '../_utils/artifacts';


// Send validator balance to a minipool
export async function withdrawValidatorBalance(minipool, txOptions) {

	// Set tx options
	txOptions.to = minipool.address;
    txOptions.gas = 12450000;

    // Send validator balance to minipool
    await web3.eth.sendTransaction(txOptions);

}

