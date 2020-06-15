import { RocketMinipool, RocketMinipoolManager, RocketMinipoolStatus, RocketNetworkWithdrawal, RocketNodeDeposit } from '../_utils/artifacts';
import { getValidatorPubkey, getValidatorSignature, getDepositDataRoot } from '../_utils/beacon';
import { getTxContractEvents } from '../_utils/contract';


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


// Progress a minipool to staking
export async function stakeMinipool(minipool, txOptions) {

    // Load contracts
    const rocketNetworkWithdrawal = await RocketNetworkWithdrawal.deployed();

    // Get withdrawal credentials
    let withdrawalCredentials = await rocketNetworkWithdrawal.getWithdrawalCredentials.call();

    // Get validator deposit data
    let depositData = {
        pubkey: getValidatorPubkey(),
        withdrawalCredentials: Buffer.from(withdrawalCredentials.substr(2), 'hex'),
        amount: BigInt(32000000000), // gwei
        signature: getValidatorSignature(),
    };
    let depositDataRoot = getDepositDataRoot(depositData);

    // Stake
    await minipool.stake(depositData.pubkey, depositData.signature, depositDataRoot, txOptions);

}


// Mark a minipool as exited
export async function exitMinipool(minipoolAddress, txOptions) {
    const rocketMinipoolStatus = await RocketMinipoolStatus.deployed();
    await rocketMinipoolStatus.exitMinipool(minipoolAddress, txOptions);
}


// Mark a minipool as withdrawable and record its final balance
export async function withdrawMinipool(minipoolAddress, withdrawalBalance, txOptions) {
    const rocketMinipoolStatus = await RocketMinipoolStatus.deployed();
    await rocketMinipoolStatus.withdrawMinipool(minipoolAddress, withdrawalBalance, txOptions);
}

