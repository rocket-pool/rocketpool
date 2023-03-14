const { RocketNodeManager, RocketMinipoolManager } = require('../_utils/artifacts');
const { assertBN } = require('./bn');

async function checkInvariants() {
    const nodeAddresses = await getNodeAddresses();

    for (const nodeAddress of nodeAddresses) {
        const minipools = await getMinipoolsByNode(nodeAddress);
        await checkNodeInvariants(nodeAddress, minipools);
    }
}

async function getNodeAddresses() {
    const rocketNodeManager = await RocketNodeManager.deployed();
    return await rocketNodeManager.getNodeAddresses(0, 1000);
}

async function getMinipoolsByNode(nodeAddress) {
    const rocketMinipoolManager = await RocketMinipoolManager.deployed();
    const count = await rocketMinipoolManager.getNodeMinipoolCount(nodeAddress);
    const minipools = [];
    for (let i = 0; i < count; i++) {
        const address = await rocketMinipoolManager.getNodeMinipoolAt(nodeAddress, i);
        minipools.push(await rocketMinipoolManager.getMinipoolDetails(address));
    }
    return minipools;
}

async function checkNodeInvariants(nodeAddress, minipools) {
    const rocketMinipoolManager = await RocketMinipoolManager.deployed();
    const rocketNodeManager = await RocketNodeManager.deployed();
    const depositSizes = ['8'.ether, '16'.ether];
    // Filter "staking" minipools
    const stakingMinipools = minipools.filter(minipool => minipool.status === '2' && minipool.finalised === false);
    // Check overall counts
    const [expectedActive, expectedFinalised, expectedStaking] = await Promise.all([
        rocketMinipoolManager.getNodeActiveMinipoolCount(nodeAddress),
        rocketMinipoolManager.getNodeFinalisedMinipoolCount(nodeAddress),
        rocketMinipoolManager.getNodeStakingMinipoolCount(nodeAddress),
    ]);
    const actualActive = minipools.filter(minipool => minipool.finalised !== true).length;
    const actualFinalised = minipools.length - actualActive;
    const actualStaking = stakingMinipools.length
    assert.equal(actualActive, expectedActive.toNumber(), 'Active minipool count invariant broken');
    assert.equal(actualFinalised, expectedFinalised.toNumber(), 'Finalised minipool count invariant broken');
    assert.equal(actualStaking, expectedStaking.toNumber(), 'Staking minipool count invariant broken');
    // Check deposit size counts
    const countBySize = await Promise.all(depositSizes.map(depositSize => rocketMinipoolManager.getNodeStakingMinipoolCountBySize(nodeAddress, depositSize)));
    for (let i = 0; i < depositSizes.length; i++) {
        const depositSize = depositSizes[i];
        const actualCount = countBySize[i].toNumber();
        const expectedCount = stakingMinipools.filter(minipool => minipool.nodeDepositBalance.BN.eq(depositSize)).length;
        assert.equal(actualCount, expectedCount, 'Deposit size specific staking minipool count invariant broken');
    }
    // Check weighted average node fee
    const expectedFee = weightedAverage(
        stakingMinipools.map(minipool => minipool.nodeFee.BN),
        stakingMinipools.map(minipool => minipool.userDepositBalance.BN),
    );
    const actualFee = await rocketNodeManager.getAverageNodeFee(nodeAddress);
    assertBN.equal(actualFee, expectedFee, 'Average node fee invariant broken');
}

function weightedAverage(nums, weights) {
    if (nums.length === 0) {
        return '0'.BN;
    }
    const [sum, weightSum] = weights.reduce(
        (acc, w, i) => {
            acc[0] = acc[0].add(nums[i].mul(w));
            acc[1] = acc[1].add(w);
            return acc;
        },
        ['0'.BN, '0'.BN],
    );
    return sum.div(weightSum);
}

module.exports = { checkInvariants };
