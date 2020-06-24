import {  } from '../_utils/artifacts';


// Withdraw from a minipool
export async function withdraw(minipool, txOptions) {

    // Withdraw
    await minipool.withdraw(txOptions);

}

