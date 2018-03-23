import { printTitle, assertThrows, soliditySha3 } from '../utils';
import { RocketVault, RocketDepositToken, RocketSettings, RocketRole } from '../artifacts';
import { scenarioAddAccount, scenarioAllowDeposits, scenarioAllowWithdrawals, scenarioDepositEther, scenarioWithdrawEther, scenarioDepositTokens, scenarioWithdrawTokens } from './rocket-vault-scenarios';

export default function({owner, accounts}) {

    describe('RocketVault - Accounts', async () => {


        // Contract dependencies
        let rocketVault;
        let rocketDepositToken;
        let rocketSettings;
        let rocketRole;
        before(async () => {
            rocketVault = await RocketVault.deployed();
            rocketDepositToken = await RocketDepositToken.deployed();
            rocketSettings = await RocketSettings.deployed();
            rocketRole = await RocketRole.deployed();
        });


        // Allowed address can deposit ether into non-token account
        it(printTitle('allowed address', 'can deposit ether into non-token account'), async () => {

            // Create non-token account; account owner is allowed by default on creation
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


        // Allowed address can withdraw ether from non-token account
        it(printTitle('allowed address', 'can withdraw ether from non-token account'), async () => {

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


        // Allowed address can deposit tokens into token account
        it(printTitle('allowed address', 'can deposit tokens into token account'), async () => {

            // Account at index 3 has an RPD balance
            const tokenAddress = accounts[3];

            // Create token account
            await scenarioAddAccount({
                accountName: soliditySha3('owner.created.token'),
                ownerAddress: owner,
                tokenContractAddress: rocketDepositToken.address,
            });

            // Allow deposits & withdrawals from token account
            await rocketVault.setAccountDepositsAllowed(soliditySha3('owner.created.token'), tokenAddress, true, {from: owner});
            await rocketVault.setAccountWithdrawalsAllowed(soliditySha3('owner.created.token'), tokenAddress, true, {from: owner});

            // Deposit tokens
            await scenarioDepositTokens({
                accountName: soliditySha3('owner.created.token'),
                fromAddress: tokenAddress,
                depositAmount: web3.toWei('0.5', 'ether'),
            });

        });


        // Allowed address can withdraw tokens from token account
        it(printTitle('allowed address', 'can withdraw tokens from token account'), async () => {
            const tokenAddress = accounts[3];

            // Withdraw tokens
            await scenarioWithdrawTokens({
                accountName: soliditySha3('owner.created.token'),
                fromAddress: tokenAddress,
                withdrawalAddress: accounts[1],
                withdrawalAmount: web3.toWei('0.1', 'ether'),
            });

        });


        // Allowed address cannot deposit zero tokens into account
        it(printTitle('allowed address', 'cannot deposit zero tokens into account'), async () => {
            const tokenAddress = accounts[3];

            // Deposit tokens
            await assertThrows(scenarioDepositTokens({
                accountName: soliditySha3('owner.created.token'),
                fromAddress: tokenAddress,
                depositAmount: web3.toWei('0', 'ether'),
            }), 'zero tokens were deposited into account');

        });


        // Allowed address cannot send ether balance with token deposit
        it(printTitle('allowed address', 'cannot send ether balance with token deposit'), async () => {
            const tokenAddress = accounts[3];

            // Deposit tokens
            await assertThrows(scenarioDepositTokens({
                accountName: soliditySha3('owner.created.token'),
                fromAddress: tokenAddress,
                depositAmount: web3.toWei('0.1', 'ether'),
                etherBalance: web3.toWei('1', 'ether'),
            }), 'ether balance was sent with token deposit');

        });


        // Allowed address cannot deposit tokens into account while vault deposits are disabled
        it(printTitle('allowed address', 'cannot deposit tokens into account while vault deposits disabled'), async () => {
            const tokenAddress = accounts[3];

            // Disable vault deposits
            await rocketSettings.setVaultDepositAllowed(false);

            // Deposit tokens
            await assertThrows(scenarioDepositTokens({
                accountName: soliditySha3('owner.created.token'),
                fromAddress: tokenAddress,
                depositAmount: web3.toWei('0.1', 'ether'),
            }), 'tokens were deposited while vault deposits disabled');

            // Re-enable vault deposits
            await rocketSettings.setVaultDepositAllowed(true);

        });


        // Allowed address cannot deposit tokens into account while account deposits are disabled
        it(printTitle('allowed address', 'cannot deposit tokens into account while account deposits disabled'), async () => {
            const tokenAddress = accounts[3];

            // Disable account deposits
            await rocketVault.setAccountDepositsEnabled(soliditySha3('owner.created.token'), false, {from: owner});

            // Deposit tokens
            await assertThrows(scenarioDepositTokens({
                accountName: soliditySha3('owner.created.token'),
                fromAddress: tokenAddress,
                depositAmount: web3.toWei('0.1', 'ether'),
            }), 'tokens were deposited while account deposits disabled');

            // Re-enable account deposits
            await rocketVault.setAccountDepositsEnabled(soliditySha3('owner.created.token'), true, {from: owner});

        });


        // Allowed address cannot withdraw zero tokens from account
        it(printTitle('allowed address', 'cannot withdraw zero tokens from account'), async () => {
            const tokenAddress = accounts[3];

            // Withdraw tokens
            await assertThrows(scenarioWithdrawTokens({
                accountName: soliditySha3('owner.created.token'),
                fromAddress: tokenAddress,
                withdrawalAddress: accounts[1],
                withdrawalAmount: web3.toWei('0', 'ether'),
            }), 'zero tokens were withdrawn from account');

        });


        // Allowed address cannot withdraw more tokens than their account balance
        it(printTitle('allowed address', 'cannot withdraw more tokens than account balance'), async () => {
            const tokenAddress = accounts[3];

            // Withdraw tokens
            await assertThrows(scenarioWithdrawTokens({
                accountName: soliditySha3('owner.created.token'),
                fromAddress: tokenAddress,
                withdrawalAddress: accounts[1],
                withdrawalAmount: web3.toWei('20', 'ether'),
            }), 'more tokens than account balance were withdrawn');

        });


        // Allowed address cannot withdraw tokens to a null address
        it(printTitle('allowed address', 'cannot withdraw tokens to a null address'), async () => {
            const tokenAddress = accounts[3];

            // Withdraw tokens
            await assertThrows(scenarioWithdrawTokens({
                accountName: soliditySha3('owner.created.token'),
                fromAddress: tokenAddress,
                withdrawalAddress: '0x0000000000000000000000000000000000000000',
                withdrawalAmount: web3.toWei('0.1', 'ether'),
            }), 'tokens were withdrawn to a null address');

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
            const accountOwner = accounts[8];

            // Create non-token account under random address
            await rocketRole.adminRoleAdd('admin', accountOwner, {from: owner});
            await rocketVault.setAccountAdd(soliditySha3('nonowner.created.nontoken'), 0x0, {from: accountOwner});
            await rocketRole.adminRoleRemove('admin', accountOwner, {from: owner});

            // Run allow deposits scenario
            await scenarioAllowDeposits({
                accountName: soliditySha3('nonowner.created.nontoken'),
                depositAddress: accounts[9],
                fromAddress: accountOwner,
            });

        });


        // Account owner can allow/disallow withdrawals from an address
        it(printTitle('account owner', 'can allow/disallow withdrawals from an address'), async () => {
            const accountOwner = accounts[8];

            // Run allow withdrawals scenario
            await scenarioAllowWithdrawals({
                accountName: soliditySha3('nonowner.created.nontoken'),
                withdrawalAddress: accounts[9],
                withdrawToAddress: accounts[1],
                fromAddress: accountOwner,
            });

        });


    });

};
