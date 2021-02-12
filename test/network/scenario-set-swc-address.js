import { RocketNetworkWithdrawal } from '../_utils/artifacts';


// Set the system withdrawal contract address
export async function setSystemWithdrawalContractAddress(swcAddress, txOptions) {

    // Load contracts
    const rocketNetworkWithdrawal = await RocketNetworkWithdrawal.deployed();

    // Set SWC address
    await rocketNetworkWithdrawal.setSystemWithdrawalContractAddress(swcAddress, txOptions);

    // Get & check updated SWC address
    let networkSwcAddress = await rocketNetworkWithdrawal.getSystemWithdrawalContractAddress.call();
    assert.equal(networkSwcAddress, swcAddress, 'Incorrect updated system withdrawal contract address');

}

