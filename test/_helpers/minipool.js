import { RocketMinipool, RocketMinipoolManager, RocketMinipoolStatus, RocketNodeDeposit } from '../_utils/artifacts';
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

