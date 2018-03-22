import { printTitle, assertThrows, soliditySha3 } from '../utils';
import { RocketVault, RocketSettings } from '../artifacts';
import { scenarioAddAccount, scenarioDepositEtherSuccessfully } from './rocket-vault-scenarios';

export default function({owner, accounts}) {

    describe('RocketVault - Accounts', async () => {


        // Contract dependencies
        let rocketVault;
        let rocketSettings;
        before(async () => {
            rocketVault = await RocketVault.deployed();
            rocketSettings = await RocketSettings.deployed();
        });


        // Owner can deposit ether into created non-token account
        it(printTitle('owner', 'can deposit ether into created non-token account'), async () => {

            // Create non-token account
            await scenarioAddAccount({
                accountName: soliditySha3("owner.created.nontoken"),
                ownerAddress: owner,
                tokenContractAddress: 0x0,
            });

            // Deposit ether
            await scenarioDepositEtherSuccessfully({
                accountName: soliditySha3("owner.created.nontoken"),
                fromAddress: owner,
                depositAmount: web3.toWei('1', 'ether'),
            });

        });


    });

};
