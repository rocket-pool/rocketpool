import { RocketSettings } from '../artifacts';
import { scenarioRegisterPartner, scenarioPartnerDeposit } from './rocket-partner-api-scenarios';


// Initialise an address as a user managed by a partner
export async function initialisePartnerUser({userAddress, partnerAddress, partnerRegisterAddress}) {
    const rocketSettings = await RocketSettings.deployed();

    // Register partner
    await scenarioRegisterPartner({
        partnerAddress: partnerAddress,
        partnerName: 'Coinbase',
        fromAddress: partnerRegisterAddress,
        gas: 200000,
    });

    // Calculate just enough ether to create a minipool
    const minEther = await rocketSettings.getMiniPoolLaunchAmount.call();
    const sendAmount = minEther.valueOf() - web3.toWei('1', 'ether');

    // Deposit on behalf of the partner
    await scenarioPartnerDeposit({
        userAddress: userAddress,
        stakingTimeID: 'medium',
        fromAddress: partnerAddress,
        depositAmount: sendAmount,
        gas: 4800000,
    });

}

