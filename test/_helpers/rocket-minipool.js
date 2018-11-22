// Dependencies
import { TimeController } from '../_lib/utils/general'
import { RocketDepositSettings, RocketMinipoolInterface, RocketMinipoolSettings } from '../_lib/artifacts';
import { userDeposit } from './rocket-deposit';


// Make minipool time out
export async function timeoutMinipool({minipoolAddress, owner}) {

    // Get contracts
    let rocketMinipoolSettings = await RocketMinipoolSettings.deployed();
    let minipool = await RocketMinipoolInterface.at(minipoolAddress);

    // Get minipool status change time and timeout period
    let minipoolTimeout = parseInt(await rocketMinipoolSettings.getMinipoolTimeout.call());
    let minipoolStatusChangeTime = parseInt(await minipool.getStatusChangedTime.call());

    // Get current block time
    let latestBlock = await web3.eth.getBlock('latest');
    let currentTime = latestBlock.timestamp;

    // Get time to advance by
    let timeDifference = minipoolTimeout + minipoolStatusChangeTime - currentTime;

    // Advance time
    if (timeDifference > 0) {
        await TimeController.addSeconds(timeDifference);
        TimeController.reset();
    }

    // Update minipool status
    await minipool.updateStatus({from: owner});

}


// Make a single minipool progress to staking
export async function stakeSingleMinipool({groupAccessorContract, staker}) {

    // Get contracts
    let rocketDepositSettings = await RocketDepositSettings.deployed();
    let rocketMinipoolSettings = await RocketMinipoolSettings.deployed();

    // Get deposit settings
    let chunkSize = parseInt(await rocketDepositSettings.getDepositChunkSize.call());
    let chunksPerDepositTx = parseInt(await rocketDepositSettings.getChunkAssignMax.call());

    // Get minipool settings
    let miniPoolLaunchAmount = parseInt(await rocketMinipoolSettings.getMinipoolLaunchAmount.call());
    let miniPoolAssignAmount = Math.floor(miniPoolLaunchAmount / 2);

    // Parameters to fill initial minipool and leave change in deposit queue
    let selfAssignableDepositSize = chunkSize * chunksPerDepositTx;
    let selfAssignableDepositsPerMinipool = Math.floor(miniPoolAssignAmount / selfAssignableDepositSize);

    // Fill minipool
    for (let di = 0; di < selfAssignableDepositsPerMinipool; ++di) {
        await userDeposit({
            depositorContract: groupAccessorContract,
            durationID: '3m',
            fromAddress: staker,
            value: selfAssignableDepositSize,
        });
    }

}

