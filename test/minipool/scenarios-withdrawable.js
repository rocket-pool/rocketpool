import { RocketMinipoolStatus } from '../_utils/artifacts';


// Submit a minipool withdrawable event
export async function submitWithdrawable(minipoolAddress, withdrawalBalance, epoch, txOptions) {

    // Load contracts
    const rocketMinipoolStatus = await RocketMinipoolStatus.deployed();

    // Submit
    await rocketMinipoolStatus.submitMinipoolWithdrawable(minipoolAddress, withdrawalBalance, epoch, txOptions);

}

