import { RocketMinipool, RocketMinipoolManager, RocketDAOProtocolSettingsMinipool, RocketMinipoolStatus, RocketNetworkPrices, RocketNetworkWithdrawal, RocketNodeDeposit, RocketDAOProtocolSettingsNode } from '../_utils/artifacts';
import { getValidatorPubkey, getValidatorSignature, getDepositDataRoot } from '../_utils/beacon';
import { getTxContractEvents } from '../_utils/contract';


// Get a minipool's total balance at withdrawal
export async function getMinipoolWithdrawalTotalBalance(minipoolAddress) {
    const rocketMinipoolManager = await RocketMinipoolManager.deployed();
    let balance = await rocketMinipoolManager.getMinipoolWithdrawalTotalBalance.call(minipoolAddress);
    return balance;
}


// Get a minipool's node balance at withdrawal
export async function getMinipoolWithdrawalNodeBalance(minipoolAddress) {
    const rocketMinipoolManager = await RocketMinipoolManager.deployed();
    let balance = await rocketMinipoolManager.getMinipoolWithdrawalNodeBalance.call(minipoolAddress);
    return balance;
}


// Get a minipool's user balance at withdrawal
export async function getMinipoolWithdrawalUserBalance(minipoolAddress) {
    const rocketMinipoolManager = await RocketMinipoolManager.deployed();
    let totalBalance = await rocketMinipoolManager.getMinipoolWithdrawalTotalBalance.call(minipoolAddress);
    let nodeBalance = await rocketMinipoolManager.getMinipoolWithdrawalNodeBalance.call(minipoolAddress);
    return totalBalance.sub(nodeBalance);
}


// Get the minimum required RPL stake for a minipool
export async function getMinipoolMinimumRPLStake() {

    // Load contracts
    const [
        rocketDAOProtocolSettingsMinipool,
        rocketNetworkPrices,
        rocketDAOProtocolSettingsNode,
    ] = await Promise.all([
        RocketDAOProtocolSettingsMinipool.deployed(),
        RocketNetworkPrices.deployed(),
        RocketDAOProtocolSettingsNode.deployed(),
    ]);

    // Load data
    let [depositUserAmount, minMinipoolStake, rplPrice] = await Promise.all([
        rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount(),
        rocketDAOProtocolSettingsNode.getMinimumPerMinipoolStake(),
        rocketNetworkPrices.getRPLPrice(),
    ]);

    // Calculate & return
    return depositUserAmount.mul(minMinipoolStake).div(rplPrice);

}


// Create a minipool
export async function createMinipool(txOptions) {

    // Load contracts
    const [
        rocketMinipoolManager,
        rocketNodeDeposit,
    ] = await Promise.all([
        RocketMinipoolManager.deployed(),
        RocketNodeDeposit.deployed(),
    ]);

    // Make node deposit
    let txReceipt = await rocketNodeDeposit.deposit(web3.utils.toWei('0', 'ether'), txOptions);

    // Get minipool created events
    let minipoolCreatedEvents = getTxContractEvents(txReceipt, rocketMinipoolManager.address, 'MinipoolCreated', [
        {type: 'address', name: 'minipool', indexed: true},
        {type: 'address', name: 'node', indexed: true},
        {type: 'uint256', name: 'created'},
    ]);

    // Return minipool instance
    if (!minipoolCreatedEvents.length) return;
    return RocketMinipool.at(minipoolCreatedEvents[0].minipool);

}


// Refund node ETH from a minipool
export async function refundMinipoolNodeETH(minipool, txOptions) {
    await minipool.refund(txOptions);
}


// Progress a minipool to staking
export async function stakeMinipool(minipool, validatorPubkey, txOptions) {

    // Load contracts
    const rocketNetworkWithdrawal = await RocketNetworkWithdrawal.deployed();

    // Create validator pubkey
    if (!validatorPubkey) validatorPubkey = getValidatorPubkey();

    // Get minipool withdrawal credentials
    let withdrawalCredentials = await minipool.getWithdrawalCredentials.call();

    // Get validator deposit data
    let depositData = {
        pubkey: validatorPubkey,
        withdrawalCredentials: Buffer.from(withdrawalCredentials.substr(2), 'hex'),
        amount: BigInt(32000000000), // gwei
        signature: getValidatorSignature(),
    };
    let depositDataRoot = getDepositDataRoot(depositData);

    // Stake
    await minipool.stake(depositData.pubkey, depositData.signature, depositDataRoot, txOptions);

}


// Submit a minipool withdrawable event
export async function submitMinipoolWithdrawable(minipoolAddress, stakingStartBalance, stakingEndBalance, txOptions) {
    const rocketMinipoolStatus = await RocketMinipoolStatus.deployed();
    await rocketMinipoolStatus.submitMinipoolWithdrawable(minipoolAddress, stakingStartBalance, stakingEndBalance, txOptions);
}


// Withdraw node balances & rewards from a minipool and destroy it
export async function withdrawMinipool(minipool, txOptions) {
    await minipool.withdraw(txOptions);
}


// Dissolve a minipool
export async function dissolveMinipool(minipool, txOptions) {
    await minipool.dissolve(txOptions);
}


// Close a dissolved minipool and destroy it
export async function closeMinipool(minipool, txOptions) {
    await minipool.close(txOptions);
}

