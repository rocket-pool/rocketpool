import {
    RocketNetworkBalances, RocketNetworkBalancesNew,
    RocketNetworkFees,
    RocketNetworkPrices, RocketNetworkPricesNew,
    RocketNetworkVoting,
    RocketNetworkWithdrawal,
} from '../_utils/artifacts';
import { upgradeExecuted } from '../_utils/upgrade';


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
export async function submitBalances(block, slotTimestamp, totalEth, stakingEth, rethSupply, txOptions) {
    if (await upgradeExecuted()) {
        const rocketNetworkBalances = await RocketNetworkBalancesNew.deployed();
        await rocketNetworkBalances.submitBalances(block, slotTimestamp, totalEth, stakingEth, rethSupply, txOptions);
    } else {
        const rocketNetworkBalances = await RocketNetworkBalances.deployed();
        await rocketNetworkBalances.submitBalances(block, totalEth, stakingEth, rethSupply, txOptions);
    }
}


// Submit network token prices
export async function submitPrices(block, slotTimestamp, rplPrice, txOptions) {
    if (await upgradeExecuted()) {
        const rocketNetworkPrices = await RocketNetworkPricesNew.deployed();
        await rocketNetworkPrices.submitPrices(block, slotTimestamp, rplPrice, txOptions);
    } else {
        const rocketNetworkPrices = await RocketNetworkPrices.deployed();
        await rocketNetworkPrices.submitPrices(block, rplPrice, txOptions);
    }
}


// Get network RPL price
export async function getRPLPrice() {
    const rocketNetworkPrices = (await upgradeExecuted()) ? await RocketNetworkPricesNew.deployed() : await RocketNetworkPrices.deployed();
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


export async function setDelegate(nodeAddress, txOptions) {
    const rocketNetworkVoting = await RocketNetworkVoting.deployed();
    await rocketNetworkVoting.setDelegate(nodeAddress, txOptions);
}

