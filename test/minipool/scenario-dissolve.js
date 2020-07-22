// Dissolve a minipool
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
    const dissolved = web3.utils.toBN(4);
    assert(!details1.status.eq(dissolved), 'Incorrect initial minipool status');
    assert(details2.status.eq(dissolved), 'Incorrect updated minipool status');
    assert(details2.userDepositBalance.eq(web3.utils.toBN(0)), 'Incorrect updated minipool user deposit balance');

}

