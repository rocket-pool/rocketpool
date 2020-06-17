import { RocketMinipoolStatus } from '../_utils/artifacts';


// Mark a minipool as withdrawable
export async function setWithdrawable(minipoolAddress, withdrawalBalance, txOptions) {

    // Load contracts
    const rocketMinipoolStatus = await RocketMinipoolStatus.deployed();

    // Exit
    await rocketMinipoolStatus.setMinipoolWithdrawable(minipoolAddress, withdrawalBalance, txOptions);

}

