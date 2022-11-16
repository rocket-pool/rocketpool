// Dissolve a minipool
import { minipoolStates } from '../_helpers/minipool';
import { assertBN } from '../_helpers/bn';

export async function dissolve(minipool, txOptions) {
    // Get minipool details
    function getMinipoolDetails() {
        return Promise.all([
            minipool.getStatus.call(),
            minipool.getUserDepositBalance.call(),
        ]).then(
            ([status, userDepositBalance]) =>
            ({status, userDepositBalance})
        );
    }

    // Get initial minipool details
    let details1 = await getMinipoolDetails();

    // Dissolve
    await minipool.dissolve(txOptions);

    // Get updated minipool details
    let details2 = await getMinipoolDetails();

    // Check minipool details
    assertBN.notEqual(details1.status, minipoolStates.Dissolved, 'Incorrect initial minipool status');
    assertBN.equal(details2.status, minipoolStates.Dissolved, 'Incorrect updated minipool status');
    assertBN.equal(details2.userDepositBalance, 0, 'Incorrect updated minipool user deposit balance');
}
