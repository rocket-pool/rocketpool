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


// Submit network ETH balances
export async function submitETHBalances(epoch, total, staking, txOptions) {
    const rocketNetworkBalances = await RocketNetworkBalances.deployed();
    await rocketNetworkBalances.submitETHBalances(epoch, total, staking, txOptions);
}


// Get the network node fee
export async function getNodeFee() {
    const rocketNetworkFees = await RocketNetworkFees.deployed();
    let nodeFee = await rocketNetworkFees.getNodeFee.call();
    return nodeFee;
}


// Get the network withdrawal credentials
export async function getWithdrawalCredentials() {
    const rocketNetworkWithdrawal = await RocketNetworkWithdrawal.deployed();
    let withdrawalCredentials = await rocketNetworkWithdrawal.getWithdrawalCredentials.call();
    return withdrawalCredentials;
}


// Accept a validator withdrawal
export async function acceptValidatorWithdrawal(txOptions) {
    const rocketNetworkWithdrawal = await RocketNetworkWithdrawal.deployed();
    await rocketNetworkWithdrawal.acceptWithdrawal(txOptions);
}


// Process a validator withdrawal
export async function processValidatorWithdrawal(validatorPubkey, txOptions) {
    const rocketNetworkWithdrawal = await RocketNetworkWithdrawal.deployed();
    await rocketNetworkWithdrawal.processWithdrawal(validatorPubkey, txOptions);
}

