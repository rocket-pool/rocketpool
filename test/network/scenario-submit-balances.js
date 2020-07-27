import { RocketNetworkBalances, RocketNodeManager, RocketStorage } from '../_utils/artifacts';


// Submit network ETH balances
export async function submitETHBalances(block, total, staking, rethSupply, txOptions) {

    // Load contracts
    const [
        rocketNetworkBalances,
        rocketNodeManager,
        rocketStorage,
    ] = await Promise.all([
        RocketNetworkBalances.deployed(),
        RocketNodeManager.deployed(),
        RocketStorage.deployed(),
    ]);

    // Get parameters
    let trustedNodeCount = await rocketNodeManager.getTrustedNodeCount.call();

    // Get submission keys
    let nodeSubmissionKey = web3.utils.soliditySha3('network.balances.submitted.node', txOptions.from, block, total, staking, rethSupply);
    let submissionCountKey = web3.utils.soliditySha3('network.balances.submitted.count', block, total, staking, rethSupply);

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

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketNetworkBalances.getETHBalancesBlock.call(),
            rocketNetworkBalances.getTotalETHBalance.call(),
            rocketNetworkBalances.getStakingETHBalance.call(),
            rocketNetworkBalances.getTotalRETHSupply.call(),
        ]).then(
            ([block, total, staking, rethSupply]) =>
            ({block, total, staking, rethSupply})
        );
    }

    // Get initial submission details
    let submission1 = await getSubmissionDetails();

    // Submit balance
    await rocketNetworkBalances.submitETHBalances(block, total, staking, rethSupply, txOptions);

    // Get updated submission details & balances
    let [submission2, balances] = await Promise.all([
        getSubmissionDetails(),
        getBalances(),
    ]);

    // Check if balances should be updated
    let expectUpdatedBalances = submission2.count.mul(web3.utils.toBN(2)).gte(trustedNodeCount);

    // Check submission details
    assert.isFalse(submission1.nodeSubmitted, 'Incorrect initial node submitted status');
    assert.isTrue(submission2.nodeSubmitted, 'Incorrect updated node submitted status');
    assert(submission2.count.eq(submission1.count.add(web3.utils.toBN(1))), 'Incorrect updated submission count');

    // Check balances
    if (expectUpdatedBalances) {
        assert(balances.block.eq(web3.utils.toBN(block)), 'Incorrect updated network balances block');
        assert(balances.total.eq(web3.utils.toBN(total)), 'Incorrect updated network total ETH balance');
        assert(balances.staking.eq(web3.utils.toBN(staking)), 'Incorrect updated network staking ETH balance');
        assert(balances.rethSupply.eq(web3.utils.toBN(rethSupply)), 'Incorrect updated network total rETH supply');
    } else {
        assert(!balances.block.eq(web3.utils.toBN(block)), 'Incorrectly updated network balances block');
        assert(!balances.total.eq(web3.utils.toBN(total)), 'Incorrectly updated network total ETH balance');
        assert(!balances.staking.eq(web3.utils.toBN(staking)), 'Incorrectly updated network staking ETH balance');
        assert(!balances.rethSupply.eq(web3.utils.toBN(rethSupply)), 'Incorrectly updated network total rETH supply');
    }

}

