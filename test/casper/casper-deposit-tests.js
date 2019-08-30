import { printTitle, assertThrows } from '../_lib/utils/general';
import { getValidatorPubkey, getWithdrawalCredentials, getValidatorSignature } from '../_lib/utils/beacon';
import { scenarioValidatorDeposit } from './casper-deposit-scenarios';


// Tests
export default function() {

    contract('Casper Deposit', async (accounts) => {


        // Accounts
        const user1 = accounts[1];


        // Cannot deposit less than the minimum deposit amount
        it(printTitle('validator', 'cannot deposit less than the minimum deposit amount into Casper'), async () => {
            await assertThrows(scenarioValidatorDeposit({
                pubkey: getValidatorPubkey(),
                withdrawalCredentials: getWithdrawalCredentials(),
                signature: getValidatorSignature(),
                fromAddress: user1,
                value: web3.utils.toWei('0.5', 'ether'),
                gas: 5000000,
            }), 'Deposited less than the minimum deposit amount into Casper.');
        });


        // Can deposit a valid deposit amount
        it(printTitle('validator', 'can deposit a valid deposit amount into Casper'), async () => {
            await scenarioValidatorDeposit({
                pubkey: getValidatorPubkey(),
                withdrawalCredentials: getWithdrawalCredentials(),
                signature: getValidatorSignature(),
                fromAddress: user1,
                value: web3.utils.toWei('32', 'ether'),
                gas: 5000000,
            });
        });


    });

}
