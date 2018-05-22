const $Web3 = require('web3');
const $web3 = new $Web3('http://localhost:8545');
import { sendDeployValidationContract } from '../_lib/smart-node/validation-code-contract-compiled';
import { printTitle, assertThrows, getContractAddressFromStorage, mineBlockAmount } from '../_lib/utils/general';
import { 
    scenarioEpochIsCurrent, 
    scenarioIncrementEpochAndInitialise, 
    scenarioVerifyDecimal10, 
    scenarioValidatorDeposit, 
    scenarioValidatorDepositSize, 
    scenarioValidatorVote, 
    scenarioValidatorLogout,
    scenarioValidatorWithdraw
} from './casper-scenarios';
import { CasperInstance, casperEpochInitialise } from '../_lib/casper/casper';


export default function({owner}) {

    contract.only('Casper', async (accounts) => {

         /**
         * Config
         */

        // User/Validator addresses
        const validatorFirst = accounts[1];
        let   validatorFirstValidationAddress = null;
        const validatorSecond = accounts[2];
        let   validatorSecondValidationAddress = null;
        const validatorThird = accounts[3];
        let   validatorThirdValidationAddress = null;
        let validatorFirstWithdrawalAddress = null;

        // Casper
        let casper = null; 

        before(async () => {
            casper = await CasperInstance();
        });
        
        // Since new blocks occur for each transaction, make sure to inialise any new epochs automatically between tests
        beforeEach(async () => {
            await casperEpochInitialise(owner);
        });

        // Simulate Caspers epoch and dynasty changing
        it(printTitle('casper', 'verify DECIMAL10 stored/read correctly using base_penalty_factor'), async () => {
            await scenarioVerifyDecimal10(owner);
        });

        // With the newly deployed Casper contract, check the epoch is current
        it(printTitle('casper', 'epoch is current and correct'), async () => {
            await scenarioEpochIsCurrent(owner);
        });

        // Incrememnt the current Casper epoch and initalise it
        it(printTitle('casper', 'epoch increment by 2 and initialise the new epoch'), async () => {
            await scenarioIncrementEpochAndInitialise(owner, 2);
        });

        // Fail to deposit less than the Casper minimum
        it(printTitle('validatorFirst', 'fail to deposit less than the Casper minimum'), async () => {            
            // Get the min deposit allowed minus 1 ether
            let minDepositInWei = parseInt(await casper.methods.MIN_DEPOSIT_SIZE().call({from: validatorFirst})) - web3.toWei(1, 'ether');
            // Deploy a validation contract for the user
            let validationTx = await sendDeployValidationContract(validatorFirst);
            // Save the validation contract address
            validatorFirstValidationAddress = validationTx.contractAddress;
            // Deposit with Casper
            await assertThrows(scenarioValidatorDeposit(validatorFirst, minDepositInWei, validatorFirstValidationAddress, validatorFirst));
        });

  
        // Deposit to Casper
        it(printTitle('validatorFirst', 'makes a successful minimum deposit into Casper'), async () => {
            // Get the min deposit allowed
            let minDepositInWei = await casper.methods.MIN_DEPOSIT_SIZE().call({from: validatorFirst});
            validatorFirstWithdrawalAddress = $web3.eth.accounts.create().address;
            // Deposit with Casper
            await scenarioValidatorDeposit(validatorFirst, minDepositInWei, validatorFirstValidationAddress, validatorFirstWithdrawalAddress);
        });


        // Verify deposit
        it(printTitle('validatorFirst', 'verify deposit amount is correct'), async () => {
            // Get the min deposit allowed
            let minDepositInWei = await casper.methods.MIN_DEPOSIT_SIZE().call({from: validatorFirst});
            // Get our deposit we just made
            let depositSize = await scenarioValidatorDepositSize(validatorFirst, validatorFirstWithdrawalAddress);
            // Check that the deposit matches
            assert.equal(Number(depositSize), Number(minDepositInWei), 'validatorFirst deposit size is incorrect');
        });


        // Fail to deposit using incorrect validation contract
        it(printTitle('validatorSecond', 'fail to deposit using incorrect validation contract'), async () => {
            // Get the min deposit allowed minus 1 ether
            let minDepositInWei = parseInt(await casper.methods.MIN_DEPOSIT_SIZE().call({from: validatorSecond})) - web3.toWei(1, 'ether');
            // Deposit with Casper
            await assertThrows(scenarioValidatorDeposit(validatorSecond, minDepositInWei, validatorFirstValidationAddress, validatorSecond));
        });

        // Deposit to Casper
        it(printTitle('validatorSecond', 'makes a successful minimum deposit into Casper'), async () => {
            // Get the min deposit allowed
            let minDepositInWei = await casper.methods.MIN_DEPOSIT_SIZE().call({from: validatorSecond});
            // Deploy a validation contract for the user
            let validationTx = await sendDeployValidationContract(validatorSecond, null);
             // Save the validation contract address
             validatorSecondValidationAddress = validationTx.contractAddress;
            // Deposit with Casper
            await scenarioValidatorDeposit(validatorSecond, minDepositInWei, validatorSecondValidationAddress, validatorSecond);
        });

        // Deposit to Casper
        it(printTitle('validatorThird', 'makes a successful minimum deposit into Casper'), async () => {
            // Deploy a validation contract for the user
            let validationTx = await sendDeployValidationContract(validatorThird);
            // Save the validation contract address
            validatorThirdValidationAddress = validationTx.contractAddress;
            // Get the min deposit allowed
            let minDepositInWei = await casper.methods.MIN_DEPOSIT_SIZE().call({from: validatorThird});
            // Deposit with Casper
            await scenarioValidatorDeposit(validatorThird, minDepositInWei, validatorThirdValidationAddress, validatorThird);
        });

        // Voting before being properly logged in is not allowed
        it(printTitle('validatorFirst', 'casts vote before they are properly logged into Casper which should fail'), async () => {
            // get the validator index from Casper
            let validatorIndex = parseInt(await casper.methods.validator_indexes(validatorFirstWithdrawalAddress).call({from: validatorFirst}));
            // get the current dynasty from Casper
            let dynasty = parseInt(await casper.methods.dynasty().call({from: validatorFirst}));
            // get the validator's start dynasty - when they can start voting
            let validatorStartDynasty = parseInt(await casper.methods.validators__start_dynasty(validatorIndex).call({from: validatorFirst}));

            // make sure the current dynasty is before the start dynasty of our validator (pool)
            // meaning we are not logged in yet
            assert.isBelow(dynasty, validatorStartDynasty, 'current dynasty should be before the validator start dynasty');

            await assertThrows(
                scenarioValidatorVote({
                    validatorAddress: validatorFirst,
                    validatorWithdrawalAddress: validatorFirstWithdrawalAddress
                })
            );
        });

        // Incrememnt the current Casper epoch and initalise it
        it(printTitle('casper', 'increment epoch/dynasty by 2 - to log all validators into Casper'), async () => {
            await scenarioIncrementEpochAndInitialise(owner, 2);
        });

        // Should not be able to vote if the signature doesn't match
        it(printTitle('validatorFirst', 'casts vote using wrong signature private key (fails deployed signature validator contract check) should fail'), async () => {
            let invalidSigningAddress = validatorSecond;

            // Perform vote but expect it to fail
            await assertThrows(
                scenarioValidatorVote({
                    validatorAddress: validatorFirst,
                    signingAddress: invalidSigningAddress,
                    validatorWithdrawalAddress: validatorFirstWithdrawalAddress
                })
            );
        });

        // Successful vote
        it(printTitle('validatorFirst', 'casts successful vote for this epoch (without reward 1st dynasty with validators)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorFirst,
                validatorWithdrawalAddress: validatorFirstWithdrawalAddress
            });
        });

         // Successful vote
         it(printTitle('validatorSecond', 'casts successful vote for this epoch (without reward 1st dynasty with validators)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorSecond
            });
        });

         // Successful vote
         it(printTitle('validatorThird', 'casts successful vote for this epoch (without reward 1st dynasty with validators)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorThird
            });
        });

        // Incrememnt the current Casper epoch and initalise it
        it(printTitle('casper', 'increment epoch by 1'), async () => {
            await scenarioIncrementEpochAndInitialise(owner, 1);
        });

         // Successful vote
         it(printTitle('validatorFirst', 'casts successful vote for this epoch (without reward 2nd dynasty with validators)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorFirst,
                validatorWithdrawalAddress: validatorFirstWithdrawalAddress
            });
        });

         // Successful vote
         it(printTitle('validatorSecond', 'casts successful vote for this epoch (without reward 2nd dynast with validators)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorSecond
            });
        });

         // Successful vote
         it(printTitle('validatorThird', 'casts successful vote for this epoch (without reward 2nd dynasty with validators)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorThird
            });
        });

        // Incrememnt the current Casper epoch and initalise it
        it(printTitle('casper', 'increment epoch by 1'), async () => {
            await scenarioIncrementEpochAndInitialise(owner, 1);
        });

        // Successful vote
        it(printTitle('validatorFirst', 'casts successful vote for this epoch (with reward)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorFirst,
                validatorWithdrawalAddress: validatorFirstWithdrawalAddress
            });
        });

         // Successful vote
         it(printTitle('validatorSecond', 'casts successful vote for this epoch (with reward)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorSecond
            });
        });

         // Successful vote
         it(printTitle('validatorThird', 'casts successful vote for this epoch (with reward)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorThird
            });
        });
        
        // Incrememnt the current Casper epoch and initalise it
        it(printTitle('casper', 'increment epoch by 1'), async () => {
            await scenarioIncrementEpochAndInitialise(owner, 1);
        });

        // Successful vote
        it(printTitle('validatorFirst', 'casts successful vote for this epoch (with reward)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorFirst,
                validatorWithdrawalAddress: validatorFirstWithdrawalAddress
            });
        });

         // Successful vote
         it(printTitle('validatorSecond', 'casts successful vote for this epoch (with reward)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorSecond
            });
        });

         // Successful vote
         it(printTitle('validatorThird', 'casts successful vote for this epoch (with reward)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorThird
            });
        });

        /** Dynasty 7 */

        // Incrememnt the current Casper epoch and initalise it
        it(printTitle('casper', 'increment epoch by 1'), async () => {
            await scenarioIncrementEpochAndInitialise(owner, 1);
        });

        // First validator leaving Casper
        it(printTitle('validatorFirst', 'calls logout to leave Casper'), async () => {
            // Perform Logout
            await scenarioValidatorLogout({
                validatorAddress: validatorFirst,
                validatorWithdrawalAddress: validatorFirstWithdrawalAddress
            });
        });

        // Successful vote
        it(printTitle('validatorFirst', 'continues voting during logout period'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorFirst,
                validatorWithdrawalAddress: validatorFirstWithdrawalAddress
            });
        });

         // Successful vote
         it(printTitle('validatorSecond', 'casts successful vote for this epoch (with reward)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorSecond
            });
        });

         // Successful vote
         it(printTitle('validatorThird', 'casts successful vote for this epoch (with reward)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorThird
            });
        });

        /** Dynasty 8 */

        // Incrememnt the current Casper epoch and initalise it
        it(printTitle('casper', 'increment epoch by 1'), async () => {
            await scenarioIncrementEpochAndInitialise(owner, 1);
        });       

        // Successful vote
        it(printTitle('validatorFirst', 'continues voting during logout period'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorFirst,
                validatorWithdrawalAddress: validatorFirstWithdrawalAddress
            });
        });

         // Successful vote
         it(printTitle('validatorSecond', 'casts successful vote for this epoch (with reward)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorSecond
            });
        });

         // Successful vote
         it(printTitle('validatorThird', 'casts successful vote for this epoch (with reward)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorThird
            });
        });

        /** Dynasty 9 */

        // Incrememnt the current Casper epoch and initalise it
        it(printTitle('casper', 'increment epoch by 1'), async () => {
            await scenarioIncrementEpochAndInitialise(owner, 1);
        });       

        // Successful vote
        it(printTitle('validatorFirst', 'continues voting during logout period'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorFirst,
                validatorWithdrawalAddress: validatorFirstWithdrawalAddress
            });
        });

         // Successful vote
         it(printTitle('validatorSecond', 'casts successful vote for this epoch (with reward)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorSecond
            });
        });

         // Successful vote
         it(printTitle('validatorThird', 'casts successful vote for this epoch (with reward)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorThird
            });
        });

         /** Dynasty 10 */

        // Incrememnt the current Casper epoch and initalise it
        it(printTitle('casper', 'increment epoch by 1'), async () => {
            await scenarioIncrementEpochAndInitialise(owner, 1);
        });       

        // Successful vote
        it(printTitle('validatorFirst', 'does not need to vote, it is logged out and awaiting withdrawal delay'), async () => {            
        });

         // Successful vote
         it(printTitle('validatorSecond', 'casts successful vote for this epoch (with reward)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorSecond
            });
        });

         // Successful vote
         it(printTitle('validatorThird', 'casts successful vote for this epoch (with reward)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorThird
            });
        });

         /** Dynasty 11 */

        // Incrememnt the current Casper epoch and initalise it
        it(printTitle('casper', 'increment epoch by 1'), async () => {
            await scenarioIncrementEpochAndInitialise(owner, 1);
        });       

        // Successful vote
        it(printTitle('validatorFirst', 'does not need to vote, it is logged out and awaiting withdrawal delay'), async () => {            
        });

         // Successful vote
         it(printTitle('validatorSecond', 'casts successful vote for this epoch (with reward)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorSecond
            });
        });

         // Successful vote
         it(printTitle('validatorThird', 'casts successful vote for this epoch (with reward)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorThird
            });
        });

         /** Dynasty 12 */

        // Incrememnt the current Casper epoch and initalise it
        it(printTitle('casper', 'increment epoch by 1'), async () => {
            await scenarioIncrementEpochAndInitialise(owner, 1);
        });       

        // Successful vote
        it(printTitle('validatorFirst', 'does not need to vote, it is logged out and awaiting withdrawal delay'), async () => {            
        });

         // Successful vote
         it(printTitle('validatorSecond', 'casts successful vote for this epoch (with reward)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorSecond
            });
        });

         // Successful vote
         it(printTitle('validatorThird', 'casts successful vote for this epoch (with reward)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorThird
            });
        });       

         /** Dynasty 13 */

        // Incrememnt the current Casper epoch and initalise it
        it(printTitle('casper', 'increment epoch by 1'), async () => {
            await scenarioIncrementEpochAndInitialise(owner, 1);
        });       

        // Successful vote
        it(printTitle('validatorFirst', 'calls withdraw and receives funds + rewards'), async () => {
            await scenarioValidatorWithdraw({validatorAddress: validatorFirst, validatorWithdrawalAddress: validatorFirstWithdrawalAddress});
        });

         // Successful vote
         it(printTitle('validatorSecond', 'casts successful vote for this epoch (with reward)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorSecond
            });
        });

         // Successful vote
         it(printTitle('validatorThird', 'casts successful vote for this epoch (with reward)'), async () => {
            // Perform Vote
            await scenarioValidatorVote({
                validatorAddress: validatorThird
            });
        });



    });

}
