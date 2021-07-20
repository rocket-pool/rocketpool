import { RocketMinipoolDelegate, RocketMinipoolManager, RocketDAOProtocolSettingsMinipool, RocketMinipoolStatus, RocketNetworkPrices, RocketNetworkWithdrawal, RocketNodeDeposit, RocketDAOProtocolSettingsNode } from '../_utils/artifacts';
import { getValidatorPubkey, getValidatorSignature, getDepositDataRoot } from '../_utils/beacon';
import { getTxContractEvents } from '../_utils/contract';


// Get the number of minipools a node has
export async function getNodeMinipoolCount(nodeAddress) {
    const rocketMinipoolManager = await RocketMinipoolManager.deployed();
    let count = await rocketMinipoolManager.getNodeMinipoolCount.call(nodeAddress);
    return count;
}

// Get the number of minipools a node has in Staking status
export async function getNodeStakingMinipoolCount(nodeAddress) {
  const rocketMinipoolManager = await RocketMinipoolManager.deployed();
  let count = await rocketMinipoolManager.getNodeStakingMinipoolCount.call(nodeAddress);
  return count;
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
    return RocketMinipoolDelegate.at(minipoolCreatedEvents[0].minipool);

}


// Refund node ETH from a minipool
export async function refundMinipoolNodeETH(minipool, txOptions) {
    await minipool.refund(txOptions);
}


// Progress a minipool to staking
export async function stakeMinipool(minipool, validatorPubkey, txOptions) {

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
export async function submitMinipoolWithdrawable(minipoolAddress, txOptions) {
    const rocketMinipoolStatus = await RocketMinipoolStatus.deployed();
    await rocketMinipoolStatus.submitMinipoolWithdrawable(minipoolAddress, txOptions);
}


// Dissolve a minipool
export async function dissolveMinipool(minipool, txOptions) {
    await minipool.dissolve(txOptions);
}


// Close a dissolved minipool and destroy it
export async function closeMinipool(minipool, txOptions) {
    await minipool.close(txOptions);
}

