import { RocketMinipoolStatus } from '../_utils/artifacts';


// Mark a minipool as withdrawable
export async function withdraw(minipoolAddress, withdrawalBalance, txOptions) {

    // Load contracts
    const rocketMinipoolStatus = await RocketMinipoolStatus.deployed();

    // Exit
    await rocketMinipoolStatus.withdrawMinipool(minipoolAddress, withdrawalBalance, txOptions);

}

