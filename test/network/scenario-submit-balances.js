import { RocketDAONodeTrusted, RocketNetworkBalances, RocketStorage } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';
import * as assert from 'assert';

const hre = require('hardhat');
const ethers = hre.ethers;

// Submit network balances
export async function submitBalances(block, slotTimestamp, totalEth, stakingEth, rethSupply, txOptions) {
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
    let trustedNodeCount = await rocketDAONodeTrusted.getMemberCount();

    // Get submission keys
    let nodeSubmissionKey = ethers.solidityPackedKeccak256(
        ['string', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256'],
        ['network.balances.submitted.node', txOptions.from.address, block, slotTimestamp, totalEth, stakingEth, rethSupply]
    );
    let submissionCountKey = ethers.solidityPackedKeccak256(
        ['string', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256'],
        ['network.balances.submitted.count', block, slotTimestamp, totalEth, stakingEth, rethSupply]
    );

    // Get submission details
    function getSubmissionDetails() {
        return Promise.all([
            rocketStorage.getBool(nodeSubmissionKey),
            rocketStorage.getUint(submissionCountKey),
        ]).then(
            ([nodeSubmitted, count]) =>
                ({ nodeSubmitted, count }),
        );
    }

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketNetworkBalances.getBalancesBlock(),
            rocketNetworkBalances.getTotalETHBalance(),
            rocketNetworkBalances.getStakingETHBalance(),
            rocketNetworkBalances.getTotalRETHSupply(),
        ]).then(
            ([block, totalEth, stakingEth, rethSupply]) =>
                ({ block, totalEth, stakingEth, rethSupply }),
        );
    }

    // Get initial submission details
    let submission1 = await getSubmissionDetails();

    // Submit balances
    await rocketNetworkBalances.connect(txOptions.from).submitBalances(block, slotTimestamp, totalEth, stakingEth, rethSupply, txOptions);

    // Get updated submission details & balances
    let [submission2, balances] = await Promise.all([
        getSubmissionDetails(),
        getBalances(),
    ]);

    // Check if balances should be updated
    let expectUpdatedBalances = (submission2.count * 2n) > trustedNodeCount;

    // Check submission details
    assert.equal(submission1.nodeSubmitted, false, 'Incorrect initial node submitted status');
    assert.equal(submission2.nodeSubmitted, true, 'Incorrect updated node submitted status');
    assertBN.equal(submission2.count, submission1.count + 1n, 'Incorrect updated submission count');

    // Check balances
    if (expectUpdatedBalances) {
        assertBN.equal(balances.block, block, 'Incorrect updated network balances block');
        assertBN.equal(balances.totalEth, totalEth, 'Incorrect updated network total ETH balance');
        assertBN.equal(balances.stakingEth, stakingEth, 'Incorrect updated network staking ETH balance');
        assertBN.equal(balances.rethSupply, rethSupply, 'Incorrect updated network total rETH supply');
    } else {
        assertBN.notEqual(balances.block, block, 'Incorrectly updated network balances block');
        assertBN.notEqual(balances.totalEth, totalEth, 'Incorrectly updated network total ETH balance');
        assertBN.notEqual(balances.stakingEth, stakingEth, 'Incorrectly updated network staking ETH balance');
        assertBN.notEqual(balances.rethSupply, rethSupply, 'Incorrectly updated network total rETH supply');
    }
}

// Execute update network balances
export async function executeUpdateBalances(block, slotTimestamp, totalEth, stakingEth, rethSupply, txOptions) {
    // Load contracts
    const rocketNetworkBalances = await RocketNetworkBalances.deployed();

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketNetworkBalances.getBalancesBlock(),
            rocketNetworkBalances.getTotalETHBalance(),
            rocketNetworkBalances.getStakingETHBalance(),
            rocketNetworkBalances.getTotalRETHSupply(),
        ]).then(
            ([block, totalEth, stakingEth, rethSupply]) =>
                ({ block, totalEth, stakingEth, rethSupply }),
        );
    }

    // Submit balances
    await rocketNetworkBalances.connect(txOptions.from).executeUpdateBalances(block, slotTimestamp, totalEth, stakingEth, rethSupply, txOptions);

    // Get updated balances
    let balances = await getBalances();

    // Check balances
    assertBN.equal(balances.block, block, 'Incorrect updated network balances block');
    assertBN.equal(balances.totalEth, totalEth, 'Incorrect updated network total ETH balance');
    assertBN.equal(balances.stakingEth, stakingEth, 'Incorrect updated network staking ETH balance');
    assertBN.equal(balances.rethSupply, rethSupply, 'Incorrect updated network total rETH supply');
}
