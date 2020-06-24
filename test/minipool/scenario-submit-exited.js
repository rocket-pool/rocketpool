import { RocketMinipoolStatus } from '../_utils/artifacts';


// Submit a minipool exited event
export async function submitExited(minipoolAddress, epoch, txOptions) {

    // Load contracts
    const rocketMinipoolStatus = await RocketMinipoolStatus.deployed();

    // Submit
    await rocketMinipoolStatus.submitMinipoolExited(minipoolAddress, epoch, txOptions);

}

