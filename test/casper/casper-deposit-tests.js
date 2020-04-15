import { printTitle, assertThrows } from '../_lib/utils/general';
import { getValidatorPubkey, getWithdrawalCredentials, getValidatorSignature, getValidatorDepositDataRoot } from '../_lib/utils/beacon';
import { scenarioValidatorDeposit } from './casper-deposit-scenarios';


// Tests
export default function() {

    contract('Casper Deposit', async (accounts) => {


        // Accounts
        const user1 = accounts[1];


        // Cannot deposit less than the minimum deposit amount
        it(printTitle('validator', 'cannot deposit less than the minimum deposit amount into Casper'), async () => {

            // Get deposit data
            let depositAmount = web3.utils.toWei('0.5', 'ether');
            let depositData = {
                pubkey: getValidatorPubkey(),
                withdrawalCredentials: getWithdrawalCredentials(),
                amount: BigInt(parseInt(depositAmount) / 1000000000), // to gwei
                signature: getValidatorSignature(),
            };
            let depositDataRoot = getValidatorDepositDataRoot(depositData);

            // Deposit
            await assertThrows(scenarioValidatorDeposit({
                pubkey: depositData.pubkey,
                withdrawalCredentials: depositData.withdrawalCredentials,
                signature: depositData.signature,
                depositDataRoot,
                fromAddress: user1,
                value: depositAmount,
                gas: 5000000,
            }), 'Deposited less than the minimum deposit amount into Casper.');

        });


        // Can deposit a valid deposit amount
        it(printTitle('validator', 'can deposit a valid deposit amount into Casper'), async () => {

            // Get deposit data
            let depositAmount = web3.utils.toWei('32', 'ether');
            let depositData = {
                pubkey: getValidatorPubkey(),
                withdrawalCredentials: getWithdrawalCredentials(),
                amount: BigInt(parseInt(depositAmount) / 1000000000), // to gwei
                signature: getValidatorSignature(),
            };
            let depositDataRoot = getValidatorDepositDataRoot(depositData);

            // Deposit
            await scenarioValidatorDeposit({
                pubkey: depositData.pubkey,
                withdrawalCredentials: depositData.withdrawalCredentials,
                signature: depositData.signature,
                depositDataRoot,
                fromAddress: user1,
                value: depositAmount,
                gas: 5000000,
            });

        });


    });

}
