// Dissolve a minipool
import { minipoolStates } from '../_helpers/minipool';
import * as assert from 'assert';

export async function dissolve(minipool, txOptions) {
    // Get minipool details
    function getMinipoolDetails() {
        return Promise.all([
            minipool.getStatus(),
            minipool.getUserDepositBalance(),
        ]).then(
            ([status, userDepositBalance]) =>
                ({ status: Number(status), userDepositBalance }),
        );
    }

    // Get initial minipool details
    let details1 = await getMinipoolDetails();

    // Dissolve
    await minipool.connect(txOptions.from).dissolve(txOptions);

    // Get updated minipool details
    let details2 = await getMinipoolDetails();

    // Check minipool details
    assert.notEqual(details1.status, minipoolStates.Dissolved, 'Incorrect initial minipool status');
    assert.equal(details2.status, minipoolStates.Dissolved, 'Incorrect updated minipool status');
}
