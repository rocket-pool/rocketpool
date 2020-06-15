import {  } from '../_utils/artifacts';


// Dissolve a minipool
export async function dissolve(minipool, txOptions) {

    // Dissolve
    await minipool.dissolve(txOptions);

}

