// Dependencies
import { TimeController } from '../_lib/utils/general'
import { RocketMinipoolInterface, RocketMinipoolSettings } from '../_lib/artifacts';


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
    await minipool.updateStatus({from: owner, gas: 500000});

}

