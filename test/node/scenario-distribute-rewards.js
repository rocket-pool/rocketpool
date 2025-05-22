import {
    RocketMinipoolDelegate,
    RocketMinipoolManager,
    RocketNodeDistributorDelegate,
    RocketNodeDistributorFactory,
    RocketNodeManager,
    RocketStorage,
    RocketTokenRETH,
} from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

const hre = require('hardhat');
const ethers = hre.ethers;

export async function distributeRewards(nodeAddress, txOptions) {
    // Get contracts
    const rocketStorage = await RocketStorage.deployed();
    const rocketNodeDistributorFactory = await RocketNodeDistributorFactory.deployed();
    const distributorAddress = await rocketNodeDistributorFactory.getProxyAddress(nodeAddress);
    const distributor = await RocketNodeDistributorDelegate.at(distributorAddress);
    const rocketTokenRETH = await RocketTokenRETH.deployed();
    const rocketMinipoolManager = await RocketMinipoolManager.deployed();
    const rocketNodeManager = await RocketNodeManager.deployed();
    // Get node withdrawal address
    const withdrawalAddress = await rocketStorage.getNodeWithdrawalAddress(nodeAddress);
    // Get distributor contract balance
    const distributorBalance = await ethers.provider.getBalance(distributorAddress);
    // Get nodes average fee
    const minipoolCount = Number(await rocketMinipoolManager.getNodeMinipoolCount(nodeAddress));

    async function getMinipoolDetails(index) {
        const minipoolAddress = await rocketMinipoolManager.getNodeMinipoolAt(nodeAddress, index);
        const minipool = await RocketMinipoolDelegate.at(minipoolAddress);
        return Promise.all([
            minipool.getStatus(),
            minipool.getNodeFee(),
        ]).then(
            ([status, fee]) => ({
                status: Number(status),
                fee,
            }),
        );
    }

    // Get status and node fee of each minipool
    const minipoolDetails = await Promise.all([...Array(minipoolCount).keys()].map(i => getMinipoolDetails(i)));

    let numerator = 0n;
    let denominator = 0n;

    for (const minipoolDetail of minipoolDetails) {
        if (minipoolDetail.status === 2) { // Staking
            numerator = numerator + minipoolDetail.fee;
            denominator = denominator + 1n;
        }
    }

    let expectedAverageFee = 0n;

    if (numerator !== 0n) {
        expectedAverageFee = numerator / denominator;
    }

    // Query average fee from contracts
    const averageFee = await rocketNodeManager.getAverageNodeFee(nodeAddress.address);
    assertBN.equal(averageFee, expectedAverageFee, 'Incorrect average node fee');

    // Calculate expected node and user amounts from average fee
    const halfAmount = distributorBalance / 2n;
    const expectedNodeAmount = halfAmount + (halfAmount * averageFee / '1'.ether);
    const expectedUserAmount = distributorBalance - expectedNodeAmount;

    async function getBalances() {
        return Promise.all([
            ethers.provider.getBalance(withdrawalAddress),
            ethers.provider.getBalance(rocketTokenRETH.target),
            rocketNodeManager.getUnclaimedRewards(nodeAddress),
        ]).then(
            ([nodeEth, userEth, unclaimedEth]) =>
                ({ nodeEth, userEth, unclaimedEth }),
        );
    }

    // Get balance before distribute
    const balances1 = await getBalances();
    // Call distributor
    await distributor.connect(txOptions.from).distribute();
    // Get balance after distribute
    const balances2 = await getBalances();
    // Check results
    const nodeEthChange = (balances2.nodeEth + balances2.unclaimedEth) - (balances1.nodeEth + balances1.unclaimedEth);
    const userEthChange = balances2.userEth - balances1.userEth;
    assertBN.equal(nodeEthChange, expectedNodeAmount, 'Node ETH balance not correct');
    assertBN.equal(userEthChange, expectedUserAmount, 'User ETH balance not correct');
}
