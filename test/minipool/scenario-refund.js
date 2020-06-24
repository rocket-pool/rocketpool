import {  } from '../_utils/artifacts';


// Refund refinanced node balance from a minipool
export async function refund(minipool, txOptions) {

    // Refund
    await minipool.refund(txOptions);

}

