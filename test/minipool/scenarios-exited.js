import { RocketMinipoolStatus } from '../_utils/artifacts';


// Mark a minipool as exited
export async function setExited(minipoolAddress, txOptions) {

    // Load contracts
    const rocketMinipoolStatus = await RocketMinipoolStatus.deployed();

    // Exit
    await rocketMinipoolStatus.setMinipoolExited(minipoolAddress, txOptions);

}

