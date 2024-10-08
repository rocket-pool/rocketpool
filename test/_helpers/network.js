import {
    RocketNetworkBalances,
    RocketNetworkFees,
    RocketNetworkPrices,
    RocketNetworkVoting,
} from '../_utils/artifacts';

// Get the network total ETH balance
export async function getTotalETHBalance() {
    const rocketNetworkBalances = await RocketNetworkBalances.deployed();
    return rocketNetworkBalances.getTotalETHBalance();
}

// Get the network staking ETH balance
export async function getStakingETHBalance() {
    const rocketNetworkBalances = await RocketNetworkBalances.deployed();
    return rocketNetworkBalances.getStakingETHBalance();
}

// Get the network ETH utilization rate
export async function getETHUtilizationRate() {
    const rocketNetworkBalances = await RocketNetworkBalances.deployed();
    return rocketNetworkBalances.getETHUtilizationRate();
}

// Submit network balances
export async function submitBalances(block, slotTimestamp, totalEth, stakingEth, rethSupply, txOptions) {
    const rocketNetworkBalances = await RocketNetworkBalances.deployed();
    await rocketNetworkBalances.connect(txOptions.from).submitBalances(block, slotTimestamp, totalEth, stakingEth, rethSupply, txOptions);
}

// Submit network token prices
export async function submitPrices(block, slotTimestamp, rplPrice, txOptions) {
    const rocketNetworkPrices = await RocketNetworkPrices.deployed();
    await rocketNetworkPrices.connect(txOptions.from).submitPrices(block, slotTimestamp, rplPrice, txOptions);
}

// Get network RPL price
export async function getRPLPrice() {
    const rocketNetworkPrices = await RocketNetworkPrices.deployed();
    return rocketNetworkPrices.getRPLPrice();
}

// Get the network node demand
export async function getNodeDemand() {
    const rocketNetworkFees = await RocketNetworkFees.deployed();
    return rocketNetworkFees.getNodeDemand();
}

// Get the current network node fee
export async function getNodeFee() {
    const rocketNetworkFees = await RocketNetworkFees.deployed();
    return rocketNetworkFees.getNodeFee();
}

// Get the network node fee for a node demand value
export async function getNodeFeeByDemand(nodeDemand) {
    const rocketNetworkFees = await RocketNetworkFees.deployed();
    return rocketNetworkFees.getNodeFeeByDemand(nodeDemand);
}

export async function setDelegate(nodeAddress, txOptions) {
    const rocketNetworkVoting = await RocketNetworkVoting.deployed();
    await rocketNetworkVoting.connect(txOptions.from).setDelegate(nodeAddress, txOptions);
}

