import { RocketDAONodeTrusted, RocketNetworkPrices, RocketStorage } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';


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
    let nodeSubmissionKey = web3.utils.soliditySha3('network.prices.submitted.node.key', txOptions.from, block, rplPrice);
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
    let expectUpdatedPrices = submission2.count.mul(web3.utils.toBN(2)).gt(trustedNodeCount);

    // Check submission details
    assert.isFalse(submission1.nodeSubmitted, 'Incorrect initial node submitted status');
    assert.isTrue(submission2.nodeSubmitted, 'Incorrect updated node submitted status');
    assertBN.equal(submission2.count, submission1.count.add(web3.utils.toBN(1)), 'Incorrect updated submission count');

    // Check prices
    if (expectUpdatedPrices) {
        assertBN.equal(prices.block, block, 'Incorrect updated network prices block');
        assertBN.equal(prices.rplPrice, rplPrice, 'Incorrect updated network RPL price');
    } else {
        assertBN.notEqual(prices.block, block, 'Incorrectly updated network prices block');
        assertBN.notEqual(prices.rplPrice, rplPrice, 'Incorrectly updated network RPL price');
    }
}


// Execute price update
export async function executeUpdatePrices(block, rplPrice, txOptions) {
    // Load contracts
    const rocketNetworkPrices = await RocketNetworkPrices.deployed();

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

    // Submit prices
    await rocketNetworkPrices.executeUpdatePrices(block, rplPrice, txOptions);

    // Get updated submission details & prices
    let prices = await getPrices();

    // Check the prices
    assertBN.equal(prices.block, block, 'Incorrect updated network prices block');
    assertBN.equal(prices.rplPrice, rplPrice, 'Incorrect updated network RPL price');
}
