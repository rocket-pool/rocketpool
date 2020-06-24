import {  } from '../_utils/artifacts';


// Close a minipool
export async function close(minipool, txOptions) {

    // Close
    await minipool.close(txOptions);

}

