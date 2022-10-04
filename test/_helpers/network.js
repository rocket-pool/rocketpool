import { RocketNetworkBalances, RocketNetworkFees, RocketNetworkPrices, RocketNetworkWithdrawal } from '../_utils/artifacts';


// Get the network total ETH balance
export async function getTotalETHBalance() {
    const rocketNetworkBalances = await RocketNetworkBalances.deployed();
    let balance = await rocketNetworkBalances.getTotalETHBalance.call();
    return balance;
}


// Get the network staking ETH balance
export async function getStakingETHBalance() {
    const rocketNetworkBalances = await RocketNetworkBalances.deployed();
    let balance = await rocketNetworkBalances.getStakingETHBalance.call();
    return balance;
}


// Get the network ETH utilization rate
export async function getETHUtilizationRate() {
    const rocketNetworkBalances = await RocketNetworkBalances.deployed();
    let utilizationRate = await rocketNetworkBalances.getETHUtilizationRate.call();
    return utilizationRate;
}


// Submit network balances
export async function submitBalances(block, totalEth, stakingEth, rethSupply, txOptions) {
    const rocketNetworkBalances = await RocketNetworkBalances.deployed();
    await rocketNetworkBalances.submitBalances(block, totalEth, stakingEth, rethSupply, txOptions);
}


// Submit network token prices
export async function submitPrices(block, rplPrice, txOptions) {
    const rocketNetworkPrices = await RocketNetworkPrices.deployed();
    await rocketNetworkPrices.submitPrices(block, rplPrice, txOptions);
}


// Get network RPL price
export async function getRPLPrice() {
    const rocketNetworkPrices = await RocketNetworkPrices.deployed();
    let price = await rocketNetworkPrices.getRPLPrice.call();
    return price;
}


// Get the network node demand
export async function getNodeDemand() {
    const rocketNetworkFees = await RocketNetworkFees.deployed();
    let nodeDemand = await rocketNetworkFees.getNodeDemand.call();
    return nodeDemand;
}


// Get the current network node fee
export async function getNodeFee() {
    const rocketNetworkFees = await RocketNetworkFees.deployed();
    let nodeFee = await rocketNetworkFees.getNodeFee.call();
    return nodeFee;
}


// Get the network node fee for a node demand value
export async function getNodeFeeByDemand(nodeDemand) {
    const rocketNetworkFees = await RocketNetworkFees.deployed();
    let nodeFee = await rocketNetworkFees.getNodeFeeByDemand.call(nodeDemand);
    return nodeFee;
}



