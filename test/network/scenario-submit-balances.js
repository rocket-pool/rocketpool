import { RocketDAONodeTrusted, RocketNetworkBalances, RocketStorage } from '../_utils/artifacts';


// Submit network balances
export async function submitBalances(block, totalEth, stakingEth, rethSupply, txOptions) {

    // Load contracts
    const [
        rocketDAONodeTrusted,
        rocketNetworkBalances,
        rocketStorage,
    ] = await Promise.all([
        RocketDAONodeTrusted.deployed(),
        RocketNetworkBalances.deployed(),
        RocketStorage.deployed(),
    ]);

    // Get parameters
    let trustedNodeCount = await rocketDAONodeTrusted.getMemberCount.call();

    // Get submission keys
    let nodeSubmissionKey = web3.utils.soliditySha3('network.balances.submitted.node', txOptions.from, block, totalEth, stakingEth, rethSupply);
    let submissionCountKey = web3.utils.soliditySha3('network.balances.submitted.count', block, totalEth, stakingEth, rethSupply);

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
            rocketNetworkBalances.getBalancesBlock.call(),
            rocketNetworkBalances.getTotalETHBalance.call(),
            rocketNetworkBalances.getStakingETHBalance.call(),
            rocketNetworkBalances.getTotalRETHSupply.call(),
        ]).then(
            ([block, totalEth, stakingEth, rethSupply]) =>
            ({block, totalEth, stakingEth, rethSupply})
        );
    }

    // Get initial submission details
    let submission1 = await getSubmissionDetails();

    // Submit balances
    await rocketNetworkBalances.submitBalances(block, totalEth, stakingEth, rethSupply, txOptions);

    // Get updated submission details & balances
    let [submission2, balances] = await Promise.all([
        getSubmissionDetails(),
        getBalances(),
    ]);

    // Check if balances should be updated
    let expectUpdatedBalances = submission2.count.mul(web3.utils.toBN(2)).gt(trustedNodeCount);

    // Check submission details
    assert.isFalse(submission1.nodeSubmitted, 'Incorrect initial node submitted status');
    assert.isTrue(submission2.nodeSubmitted, 'Incorrect updated node submitted status');
    assert(submission2.count.eq(submission1.count.add(web3.utils.toBN(1))), 'Incorrect updated submission count');

    // Check balances
    if (expectUpdatedBalances) {
        assert(balances.block.eq(web3.utils.toBN(block)), 'Incorrect updated network balances block');
        assert(balances.totalEth.eq(web3.utils.toBN(totalEth)), 'Incorrect updated network total ETH balance');
        assert(balances.stakingEth.eq(web3.utils.toBN(stakingEth)), 'Incorrect updated network staking ETH balance');
        assert(balances.rethSupply.eq(web3.utils.toBN(rethSupply)), 'Incorrect updated network total rETH supply');
    } else {
        assert(!balances.block.eq(web3.utils.toBN(block)), 'Incorrectly updated network balances block');
        assert(!balances.totalEth.eq(web3.utils.toBN(totalEth)), 'Incorrectly updated network total ETH balance');
        assert(!balances.stakingEth.eq(web3.utils.toBN(stakingEth)), 'Incorrectly updated network staking ETH balance');
        assert(!balances.rethSupply.eq(web3.utils.toBN(rethSupply)), 'Incorrectly updated network total rETH supply');
    }

}

// Execute update network balances
export async function executeUpdateBalances(block, totalEth, stakingEth, rethSupply, txOptions) {

    // Load contracts
    const rocketNetworkBalances = await RocketNetworkBalances.deployed()

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketNetworkBalances.getBalancesBlock.call(),
            rocketNetworkBalances.getTotalETHBalance.call(),
            rocketNetworkBalances.getStakingETHBalance.call(),
            rocketNetworkBalances.getTotalRETHSupply.call(),
        ]).then(
          ([block, totalEth, stakingEth, rethSupply]) =>
            ({block, totalEth, stakingEth, rethSupply})
        );
    }

    // Submit balances
    await rocketNetworkBalances.executeUpdateBalances(block, totalEth, stakingEth, rethSupply, txOptions);

    // Get updated balances
    let balances = await getBalances()

    // Check balances
    assert(balances.block.eq(web3.utils.toBN(block)), 'Incorrect updated network balances block');
    assert(balances.totalEth.eq(web3.utils.toBN(totalEth)), 'Incorrect updated network total ETH balance');
    assert(balances.stakingEth.eq(web3.utils.toBN(stakingEth)), 'Incorrect updated network staking ETH balance');
    assert(balances.rethSupply.eq(web3.utils.toBN(rethSupply)), 'Incorrect updated network total rETH supply');

}

