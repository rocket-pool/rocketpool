const { RocketNodeManager, RocketMinipoolManager, RocketMinipoolDelegate } = require('../../test-old/_utils/artifacts');
const { assertBN } = require('./bn');
const assert = require('assert');
const { getMegapoolForNodeAddress } = require('./megapool');
const { RocketNodeStaking, RocketDepositPool } = require('../_utils/artifacts');

async function checkInvariants() {
    const nodeAddresses = await getNodeAddresses();

    for (const nodeAddress of nodeAddresses) {
        const minipools = await getMinipoolsByNode(nodeAddress);
        await checkNodeInvariants(nodeAddress, minipools);
    }

    await checkMegapoolInvariants()
}

async function checkMegapoolInvariants() {
    // Check deposit.pool.node.balance invariant
    const nodeAddresses = await getNodeAddresses();

    let totalNodeQueuedBond = 0n
    for (const nodeAddress of nodeAddresses) {
        const megapool = await getMegapoolForNodeAddress(nodeAddress);

        // Sum queued bond
        if (megapool) {
            const nodeQueuedBond = await megapool.getNodeQueuedBond();
            totalNodeQueuedBond += nodeQueuedBond;
        }

        // Check ETH matched and ETH provided match megapool values
        if (megapool) {
            const rocketNodeStaking = await RocketNodeStaking.deployed();
            const ethBorrowed = await rocketNodeStaking.getNodeMegapoolETHBorrowed(nodeAddress);
            const ethBonded = await rocketNodeStaking.getNodeMegapoolETHBonded(nodeAddress);
            const nodeBond = (await megapool.getNodeBond()) + (await megapool.getNodeQueuedBond());
            const userCapital = (await megapool.getUserCapital()) + (await megapool.getUserQueuedCapital());
            assertBN.equal(ethBorrowed, userCapital, 'ETH borrowed did not match user capital');
            assertBN.equal(ethBonded, nodeBond, 'ETH bonded did not match node bond');
        }
    }

    // Check sum of queued bond equals the node balance
    const rocketDepositPool = await RocketDepositPool.deployed()
    const nodeBalance = await rocketDepositPool.getNodeBalance();
    assertBN.equal(nodeBalance, totalNodeQueuedBond, "Node balance does not match")
}

async function getNodeAddresses() {
    const rocketNodeManager = await RocketNodeManager.deployed();
    return await rocketNodeManager.getNodeAddresses(0, 1000);
}

async function getMinipoolDetails(address) {
    const minipool = await RocketMinipoolDelegate.at(address);

    const [status, finalised, nodeFee, userDepositBalance, nodeDepositBalance] = await Promise.all([
        minipool.getStatus(),
        minipool.getFinalised(),
        minipool.getNodeFee(),
        minipool.getUserDepositBalance(),
        minipool.getNodeDepositBalance(),
    ]);

    return {
        status: status.toString(),
        finalised,
        nodeFee,
        userDepositBalance,
        nodeDepositBalance,
    };
}

async function getMinipoolsByNode(nodeAddress) {
    const rocketMinipoolManager = await RocketMinipoolManager.deployed();
    const count = await rocketMinipoolManager.getNodeMinipoolCount(nodeAddress);
    const minipools = [];
    for (let i = 0; i < count; i++) {
        const address = await rocketMinipoolManager.getNodeMinipoolAt(nodeAddress, i);
        minipools.push(await getMinipoolDetails(address));
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
    const actualStaking = stakingMinipools.length;
    assert.equal(actualActive, Number(expectedActive), 'Active minipool count invariant broken');
    assert.equal(actualFinalised, Number(expectedFinalised), 'Finalised minipool count invariant broken');
    assert.equal(actualStaking, Number(expectedStaking), 'Staking minipool count invariant broken');
    // Check deposit size counts
    const countBySize = await Promise.all(depositSizes.map(depositSize => rocketMinipoolManager.getNodeStakingMinipoolCountBySize(nodeAddress, depositSize)));
    for (let i = 0; i < depositSizes.length; i++) {
        const depositSize = depositSizes[i];
        const actualCount = Number(countBySize[i]);
        const expectedCount = stakingMinipools.filter(minipool => minipool.nodeDepositBalance === depositSize).length;
        assert.equal(actualCount, expectedCount, 'Deposit size specific staking minipool count invariant broken');
    }
    // Check weighted average node fee
    const expectedFee = weightedAverage(
        stakingMinipools.map(minipool => minipool.nodeFee),
        stakingMinipools.map(minipool => minipool.userDepositBalance),
    );
    const actualFee = await rocketNodeManager.getAverageNodeFee(nodeAddress);
    assertBN.equal(actualFee, expectedFee, 'Average node fee invariant broken');
}

function weightedAverage(nums, weights) {
    if (nums.length === 0) {
        return 0n;
    }
    const [sum, weightSum] = weights.reduce(
        (acc, w, i) => {
            acc[0] = acc[0] + (nums[i] * w);
            acc[1] = acc[1] + w;
            return acc;
        },
        [0n, 0n],
    );
    return sum / weightSum;
}

module.exports = { checkInvariants, checkMegapoolInvariants };
