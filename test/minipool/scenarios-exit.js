import { RocketMinipoolStatus } from '../_utils/artifacts';


// Mark a minipool as exited
export async function exit(minipoolAddress, txOptions) {

    // Load contracts
    const rocketMinipoolStatus = await RocketMinipoolStatus.deployed();

    // Exit
    await rocketMinipoolStatus.exitMinipool(minipoolAddress, txOptions);

}

