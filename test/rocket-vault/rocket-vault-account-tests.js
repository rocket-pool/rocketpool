import { printTitle, assertThrows, soliditySha3 } from '../utils';
import { RocketVault, RocketSettings, RocketRole } from '../artifacts';
import { scenarioAddAccount, scenarioAllowDeposits, scenarioAllowWithdrawals, scenarioDepositEther, scenarioWithdrawEther } from './rocket-vault-scenarios';

export default function({owner, accounts}) {

    describe('RocketVault - Accounts', async () => {


        // Contract dependencies
        let rocketVault;
        let rocketSettings;
        let rocketRole;
        before(async () => {
            rocketVault = await RocketVault.deployed();
            rocketSettings = await RocketSettings.deployed();
            rocketRole = await RocketRole.deployed();
        });


        // Allowed address can deposit ether into created non-token account
        it(printTitle('allowed address', 'can deposit ether into created non-token account'), async () => {

            // Create non-token account; owner is allowed by default on creation
            await scenarioAddAccount({
                accountName: soliditySha3('owner.created.nontoken'),
                ownerAddress: owner,
                tokenContractAddress: 0x0,
            });

            // Deposit ether
            await scenarioDepositEther({
                accountName: soliditySha3('owner.created.nontoken'),
                fromAddress: owner,
                depositAmount: web3.toWei('10', 'ether'),
            });

        });


        // Allowed address can withdraw ether from created non-token account
        it(printTitle('allowed address', 'can withdraw ether from created non-token account'), async () => {

            // Withdraw ether
            await scenarioWithdrawEther({
                accountName: soliditySha3('owner.created.nontoken'),
                fromAddress: owner,
                withdrawalAddress: accounts[1],
                withdrawalAmount: web3.toWei('1', 'ether'),
            });

        });


        // Allowed address cannot deposit zero ether into account
        it(printTitle('allowed address', 'cannot deposit zero ether into account'), async () => {

            // Deposit ether
            await assertThrows(scenarioDepositEther({
                accountName: soliditySha3('owner.created.nontoken'),
                fromAddress: owner,
                depositAmount: web3.toWei('0', 'ether'),
            }), 'zero ether was deposited into account');

        });


        // Allowed address cannot deposit ether into account while vault deposits are disabled
        it(printTitle('allowed address', 'cannot deposit ether into account while vault deposits disabled'), async () => {

            // Disable vault deposits
            await rocketSettings.setVaultDepositAllowed(false);

            // Deposit ether
            await assertThrows(scenarioDepositEther({
                accountName: soliditySha3('owner.created.nontoken'),
                fromAddress: owner,
                depositAmount: web3.toWei('1', 'ether'),
            }), 'ether was deposited while vault deposits disabled');

            // Re-enable vault deposits
            await rocketSettings.setVaultDepositAllowed(true);

        });


        // Allowed address cannot deposit ether into account while account deposits are disabled
        it(printTitle('allowed address', 'cannot deposit ether into account while account deposits disabled'), async () => {

            // Disable account deposits
            await rocketVault.setAccountDepositsEnabled(soliditySha3('owner.created.nontoken'), false, {from: owner});

            // Deposit ether
            await assertThrows(scenarioDepositEther({
                accountName: soliditySha3('owner.created.nontoken'),
                fromAddress: owner,
                depositAmount: web3.toWei('1', 'ether'),
            }), 'ether was deposited while account deposits disabled');

            // Re-enable account deposits
            await rocketVault.setAccountDepositsEnabled(soliditySha3('owner.created.nontoken'), true, {from: owner});

        });


        // Allowed address cannot withdraw zero ether from account
        it(printTitle('allowed address', 'cannot withdraw zero ether from account'), async () => {

            // Withdraw ether
            await assertThrows(scenarioWithdrawEther({
                accountName: soliditySha3('owner.created.nontoken'),
                fromAddress: owner,
                withdrawalAddress: accounts[1],
                withdrawalAmount: web3.toWei('0', 'ether'),
            }), 'zero ether was withdrawn from account');

        });


        // Allowed address cannot withdraw more ether than their account balance
        it(printTitle('allowed address', 'cannot withdraw more ether than account balance'), async () => {

            // Withdraw ether
            await assertThrows(scenarioWithdrawEther({
                accountName: soliditySha3('owner.created.nontoken'),
                fromAddress: owner,
                withdrawalAddress: accounts[1],
                withdrawalAmount: web3.toWei('20', 'ether'),
            }), 'more ether than account balance was withdrawn');

        });


        // Allowed address cannot withdraw ether to a null address
        it(printTitle('allowed address', 'cannot withdraw ether to a null address'), async () => {

            // Withdraw ether
            await assertThrows(scenarioWithdrawEther({
                accountName: soliditySha3('owner.created.nontoken'),
                fromAddress: owner,
                withdrawalAddress: '0x0000000000000000000000000000000000000000',
                withdrawalAmount: web3.toWei('1', 'ether'),
            }), 'ether was withdrawn to a null address');

        });


        // Allowed address cannot withdraw ether from account while vault withdrawals are disabled
        it(printTitle('allowed address', 'cannot withdraw ether from account while vault withdrawals disabled'), async () => {

            // Disable vault withdrawals
            await rocketSettings.setVaultWithdrawalAllowed(false);

            // Withdraw ether
            await assertThrows(scenarioWithdrawEther({
                accountName: soliditySha3('owner.created.nontoken'),
                fromAddress: owner,
                withdrawalAddress: accounts[1],
                withdrawalAmount: web3.toWei('1', 'ether'),
            }), 'ether was withdrawn while vault withdrawals disabled');

            // Re-enable vault withdrawals
            await rocketSettings.setVaultWithdrawalAllowed(true);

        });


        // Allowed address cannot withdraw ether from account while account withdrawals are disabled
        it(printTitle('allowed address', 'cannot withdraw ether from account while account withdrawals disabled'), async () => {

            // Disable account withdrawals
            await rocketVault.setAccountWithdrawalsEnabled(soliditySha3('owner.created.nontoken'), false, {from: owner});

            // Withdraw ether
            await assertThrows(scenarioWithdrawEther({
                accountName: soliditySha3('owner.created.nontoken'),
                fromAddress: owner,
                withdrawalAddress: accounts[1],
                withdrawalAmount: web3.toWei('1', 'ether'),
            }), 'ether was withdrawn while account withdrawals disabled');

            // Re-enable account withdrawals
            await rocketVault.setAccountWithdrawalsEnabled(soliditySha3('owner.created.nontoken'), true, {from: owner});

        });


        // Random address cannot deposit ether into account
        it(printTitle('random address', 'cannot deposit ether into account'), async () => {

            // Deposit ether
            await assertThrows(scenarioDepositEther({
                accountName: soliditySha3('owner.created.nontoken'),
                fromAddress: accounts[9],
                depositAmount: web3.toWei('1', 'ether'),
            }), 'random address deposited ether into account');

        });


        // Random address cannot withdraw ether from account
        it(printTitle('random address', 'cannot withdraw ether from account'), async () => {

            // Withdraw ether
            await assertThrows(scenarioWithdrawEther({
                accountName: soliditySha3('owner.created.nontoken'),
                fromAddress: accounts[9],
                withdrawalAddress: accounts[1],
                withdrawalAmount: web3.toWei('1', 'ether'),
            }), 'random address withdrew ether from account');

        });


        // Owner can allow/disallow deposits from an address
        it(printTitle('owner', 'can allow/disallow deposits from an address'), async () => {

            // Run allow deposits scenario
            await scenarioAllowDeposits({
                accountName: soliditySha3('owner.created.nontoken'),
                depositAddress: accounts[9],
                fromAddress: owner,
            });

        });


        // Owner can allow/disallow withdrawals from an address
        it(printTitle('owner', 'can allow/disallow withdrawals from an address'), async () => {

            // Run allow withdrawals scenario
            await scenarioAllowWithdrawals({
                accountName: soliditySha3('owner.created.nontoken'),
                withdrawalAddress: accounts[9],
                withdrawToAddress: accounts[1],
                fromAddress: owner,
            });

        });


        // Account owner can allow/disallow deposits from an address
        it(printTitle('account owner', 'can allow/disallow deposits from an address'), async () => {

            // Create non-token account under random address
            await rocketRole.adminRoleAdd('admin', accounts[8], {from: owner});
            await rocketVault.setAccountAdd(soliditySha3('nonowner.created.nontoken'), 0x0, {from: accounts[8]});
            await rocketRole.adminRoleRemove('admin', accounts[8], {from: owner});

            // Run allow deposits scenario
            await scenarioAllowDeposits({
                accountName: soliditySha3('nonowner.created.nontoken'),
                depositAddress: accounts[9],
                fromAddress: accounts[8],
            });

        });


        // Account owner can allow/disallow withdrawals from an address
        it(printTitle('account owner', 'can allow/disallow withdrawals from an address'), async () => {

            // Run allow withdrawals scenario
            await scenarioAllowWithdrawals({
                accountName: soliditySha3('nonowner.created.nontoken'),
                withdrawalAddress: accounts[9],
                withdrawToAddress: accounts[1],
                fromAddress: accounts[8],
            });

        });


    });

};
