import { printTitle, assertThrows, soliditySha3 } from '../utils';
import { RocketVault, RocketSettings } from '../artifacts';
import { scenarioAddAccount, scenarioDepositEther, scenarioWithdrawEther } from './rocket-vault-scenarios';

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
            await scenarioDepositEther({
                accountName: soliditySha3("owner.created.nontoken"),
                fromAddress: owner,
                depositAmount: web3.toWei('2', 'ether'),
            });

        });


        // Owner can withdraw ether from created non-token account
        it(printTitle('owner', 'can withdraw ether from created non-token account'), async () => {

            // Withdraw ether
            await scenarioWithdrawEther({
                accountName: soliditySha3("owner.created.nontoken"),
                fromAddress: owner,
                withdrawalAddress: accounts[1],
                withdrawalAmount: web3.toWei('1', 'ether'),
            });

        });


        // Owner cannot deposit ether into account while vault deposits are disabled
        it(printTitle('owner', 'cannot deposit ether into account while vault deposits disabled'), async () => {

            // Disable vault deposits
            await rocketSettings.setVaultDepositAllowed(false);

            // Deposit ether
            await assertThrows(scenarioDepositEther({
                accountName: soliditySha3("owner.created.nontoken"),
                fromAddress: owner,
                depositAmount: web3.toWei('1', 'ether'),
            }), 'ether was deposited while vault deposits disabled');

            // Re-enable vault deposits
            await rocketSettings.setVaultDepositAllowed(true);

        });


    });

};
