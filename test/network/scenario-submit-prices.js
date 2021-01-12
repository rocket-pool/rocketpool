import { RocketDAONodeTrusted, RocketNetworkPrices, RocketStorage } from '../_utils/artifacts';


// Submit network prices
export async function submitPrices(block, rplPrice, txOptions) {

    // Load contracts
    const [
        rocketDAONodeTrusted,
        rocketNetworkPrices,
        rocketStorage,
    ] = await Promise.all([
        RocketDAONodeTrusted.deployed(),
        RocketNetworkPrices.deployed(),
        RocketStorage.deployed(),
    ]);

    // Get parameters
    let trustedNodeCount = await rocketDAONodeTrusted.getMemberCount.call();

    // Get submission keys
    let nodeSubmissionKey = web3.utils.soliditySha3('network.prices.submitted.node', txOptions.from, block, rplPrice);
    let submissionCountKey = web3.utils.soliditySha3('network.prices.submitted.count', block, rplPrice);

    // Get submission details
    function getSubmissionDetails() {
        return Promise.all([
            rocketStorage.getBool.call(nodeSubmissionKey),
            rocketStorage.getUint.call(submissionCountKey),
        ]).then(
            ([nodeSubmitted, count]) =>
            ({nodeSubmitted, count})
        );
    }

    // Get prices
    function getPrices() {
        return Promise.all([
            rocketNetworkPrices.getPricesBlock.call(),
            rocketNetworkPrices.getRPLPrice.call(),
        ]).then(
            ([block, rplPrice]) =>
            ({block, rplPrice})
        );
    }

    // Get initial submission details
    let submission1 = await getSubmissionDetails();

    // Submit prices
    await rocketNetworkPrices.submitPrices(block, rplPrice, txOptions);

    // Get updated submission details & prices
    let [submission2, prices] = await Promise.all([
        getSubmissionDetails(),
        getPrices(),
    ]);

    // Check if prices should be updated
    let expectUpdatedPrices = submission2.count.mul(web3.utils.toBN(2)).gte(trustedNodeCount);

    // Check submission details
    assert.isFalse(submission1.nodeSubmitted, 'Incorrect initial node submitted status');
    assert.isTrue(submission2.nodeSubmitted, 'Incorrect updated node submitted status');
    assert(submission2.count.eq(submission1.count.add(web3.utils.toBN(1))), 'Incorrect updated submission count');

    // Check prices
    if (expectUpdatedPrices) {
        assert(prices.block.eq(web3.utils.toBN(block)), 'Incorrect updated network prices block');
        assert(prices.rplPrice.eq(web3.utils.toBN(rplPrice)), 'Incorrect updated network RPL price');
    } else {
        assert(!prices.block.eq(web3.utils.toBN(block)), 'Incorrectly updated network prices block');
        assert(!prices.rplPrice.eq(web3.utils.toBN(rplPrice)), 'Incorrectly updated network RPL price');
    }

}

