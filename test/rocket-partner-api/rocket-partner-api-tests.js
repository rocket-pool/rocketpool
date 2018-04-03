import { printTitle, assertThrows } from '../utils';
import { RocketSettings } from '../artifacts';
import { scenarioRegisterPartner, scenarioPartnerDeposit } from './rocket-partner-api-scenarios';

export default function({
    owner,
    accounts,
    userFirst,
    userSecond,
    userThird,
    partnerFirst,
    partnerFirstName,
    partnerFirstUserAccount,
    partnerSecond,
    partnerSecondName,
    partnerRegisterGas,
    rocketDepositGas
}) {

    describe('RocketPartnerAPI', async () => {


        // Contract dependencies
        let rocketSettings;
        before(async () => {
            rocketSettings = await RocketSettings.deployed();
        });


        // Try to register a new partner as a non rocket pool owner
        it(printTitle('non owner', 'fail to register a partner'), async () => {
            await assertThrows(scenarioRegisterPartner({
                partnerAddress: partnerFirst,
                partnerName: partnerFirstName,
                fromAddress: userFirst,
                gas: partnerRegisterGas
            }));
        });


        // Register two 3rd party partners
        it(printTitle('owner', 'register 2 partners'), async () => {

            // Register first partner
            await scenarioRegisterPartner({
                partnerAddress: partnerFirst,
                partnerName: partnerFirstName,
                fromAddress: owner,
                gas: partnerRegisterGas
            });

            // Register second partner
            await scenarioRegisterPartner({
                partnerAddress: partnerSecond,
                partnerName: partnerSecondName,
                fromAddress: owner,
                gas: partnerRegisterGas
            });

        });


        // Attempt to make a deposit with an incorrect pool staking time ID
        it(printTitle('partnerFirst', 'fail to deposit with an incorrect pool staking time ID'), async () => {

            // Calculate just enough ether to create a minipool
            const minEther = await rocketSettings.getMiniPoolLaunchAmount.call();
            const sendAmount = minEther.valueOf() - web3.toWei('1', 'ether');

            // Deposit on behalf of the partner with an invalid pool staking time ID
            await assertThrows(scenarioPartnerDeposit({
                userAddress: partnerFirstUserAccount,
                stakingTimeID: 'beer',
                fromAddress: partnerFirst,
                value: sendAmount,
                gas: rocketDepositGas,
            }));

        });


        // Attempt to make a deposit with an unregistered 3rd party partner
        it(printTitle('userFirst', 'fail to deposit with an unregistered partner'), async () => {
            
            // Calculate just enough ether to create a minipool
            const minEther = await rocketSettings.getMiniPoolLaunchAmount.call();
            const sendAmount = minEther.valueOf() - web3.toWei('1', 'ether');

            // Deposit on behalf of an unregistered partner
            await assertThrows(scenarioPartnerDeposit({
                userAddress: userThird,
                stakingTimeID: 'short',
                fromAddress: userSecond,
                value: sendAmount,
                gas: rocketDepositGas,
            }));

        });


    });

}
