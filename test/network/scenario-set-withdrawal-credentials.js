import { RocketNetworkWithdrawal } from '../_utils/artifacts';


// Set the network withdrawal credentials
export async function setWithdrawalCredentials(withdrawalCredentials, txOptions) {

    // Load contracts
    const rocketNetworkWithdrawal = await RocketNetworkWithdrawal.deployed();

    // Set withdrawal credentials
    await rocketNetworkWithdrawal.setWithdrawalCredentials(withdrawalCredentials, txOptions);

    // Get & check updated withdrawal credentials
    let networkWithdrawalCredentials = await rocketNetworkWithdrawal.getWithdrawalCredentials.call();
    assert.equal(networkWithdrawalCredentials, '0x'+withdrawalCredentials.toString('hex'), 'Incorrect updated withdrawal credentials');

}

