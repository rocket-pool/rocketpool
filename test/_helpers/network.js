import { RocketNetworkBalances, RocketNetworkFees, RocketNetworkWithdrawal } from '../_utils/artifacts';


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


// Submit network ETH balances
export async function submitETHBalances(block, total, staking, rethSupply, txOptions) {
    const rocketNetworkBalances = await RocketNetworkBalances.deployed();
    await rocketNetworkBalances.submitETHBalances(block, total, staking, rethSupply, txOptions);
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


// Get the network withdrawal credentials
export async function getWithdrawalCredentials() {
    const rocketNetworkWithdrawal = await RocketNetworkWithdrawal.deployed();
    let withdrawalCredentials = await rocketNetworkWithdrawal.getWithdrawalCredentials.call();
    return withdrawalCredentials;
}


// Accept a validator withdrawal
export async function depositValidatorWithdrawal(txOptions) {
    const rocketNetworkWithdrawal = await RocketNetworkWithdrawal.deployed();
    txOptions.to = rocketNetworkWithdrawal.address;
    await web3.eth.sendTransaction(txOptions);
}


// Process a validator withdrawal
export async function processValidatorWithdrawal(validatorPubkey, txOptions) {
    const rocketNetworkWithdrawal = await RocketNetworkWithdrawal.deployed();
    await rocketNetworkWithdrawal.processWithdrawal(validatorPubkey, txOptions);
}

