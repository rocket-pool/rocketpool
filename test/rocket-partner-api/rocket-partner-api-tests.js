import { printTitle, assertThrows } from '../utils';
import { RocketSettings } from '../artifacts';
import { scenarioRegisterPartner, scenarioPartnerDeposit, scenarioRemovePartner } from './rocket-partner-api-scenarios';

export function rocketPartnerAPIRegistrationTests({
    owner,
    accounts,
    userFirst,
    partnerFirst,
    partnerFirstName,
    partnerSecond,
    partnerSecondName,
    partnerRegisterGas
}) {

    describe('RocketPartnerAPI - Registration', async () => {


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


    });

}

export function rocketPartnerAPIDepositTests1({
    owner,
    accounts,
    userSecond,
    userThird,
    partnerFirst,
    partnerFirstUserAccount,
    rocketDepositGas
}) {

    describe('RocketPartnerAPI - Deposits', async () => {


        // Contract dependencies
        let rocketSettings;
        before(async () => {
            rocketSettings = await RocketSettings.deployed();
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
                depositAmount: sendAmount,
                gas: rocketDepositGas,
            }));

        });


        // Attempt to make a deposit with an unregistered 3rd party partner
        it(printTitle('userThird', 'fail to deposit with an unregistered partner'), async () => {
            
            // Calculate just enough ether to create a minipool
            const minEther = await rocketSettings.getMiniPoolLaunchAmount.call();
            const sendAmount = minEther.valueOf() - web3.toWei('1', 'ether');

            // Deposit on behalf of an unregistered partner
            await assertThrows(scenarioPartnerDeposit({
                userAddress: userThird,
                stakingTimeID: 'short',
                fromAddress: userSecond,
                depositAmount: sendAmount,
                gas: rocketDepositGas,
            }));

        });


    });

}

export function rocketPartnerAPIRemovalTests({
    owner,
    accounts,
    partnerFirst,
    partnerSecond
}) {

    describe('RocketPartnerAPI - Removal', async () => {


        // Owner removes first partner - users attached to this partner can still withdraw
        it(printTitle('owner', 'removes first partner from the Rocket Pool network'), async () => {
            await scenarioRemovePartner({
                partnerAddress: partnerFirst,
                newerPartnerAddress: partnerSecond,
                fromAddress: owner,
                gas: 500000,
            });
        });


    });

}

export function rocketPartnerAPIDepositTests2({
    owner,
    accounts,
    partnerFirst,
    partnerFirstUserAccount,
    rocketDepositGas,
}) {

    describe('RocketPartnerAPI - Deposits', async () => {


        // Contract dependencies
        let rocketSettings;
        before(async () => {
            rocketSettings = await RocketSettings.deployed();
        });


        // Attempt to make a deposit after being removed as a partner
        it(printTitle('partnerFirst', 'attempt to make a deposit after being removed as a partner'), async () => {

            // Calculate just enough ether to create a minipool
            const minEther = await rocketSettings.getMiniPoolLaunchAmount.call();
            const sendAmount = minEther.valueOf() - web3.toWei('1', 'ether');

            // Attempt deposit
            await assertThrows(scenarioPartnerDeposit({
                userAddress: partnerFirstUserAccount,
                stakingTimeID: 'short',
                fromAddress: partnerFirst,
                depositAmount: sendAmount,
                gas: rocketDepositGas,
            }));

        });


    });

}
