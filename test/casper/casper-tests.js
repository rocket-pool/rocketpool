import { sendDeployValidationContract } from '../_lib/smart-node/validation-code-contract-compiled';
import { printTitle, assertThrows, getContractAddressFromStorage, mineBlockAmount } from '../_lib/utils/general';
import { scenarioEpochIsCurrent, scenarioIncrementEpochAndInitialise, scenarioVerifyDecimal10, scenarioValidatorDeposit, scenarioValidatorDepositSize, scenarioValidatorVote } from './casper-scenarios';
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
            // Casper
            const casper = await CasperInstance();
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
            // Casper
            const casper = await CasperInstance();
            // Get the min deposit allowed
            let minDepositInWei = await casper.methods.MIN_DEPOSIT_SIZE().call({from: validatorFirst});
            // Deposit with Casper
            await scenarioValidatorDeposit(validatorFirst, minDepositInWei, validatorFirstValidationAddress, validatorFirst);
        });


        // Verify deposit
        it(printTitle('validatorFirst', 'verify deposit amount is correct'), async () => {
            // Casper
            const casper = await CasperInstance();
            // Get the min deposit allowed
            let minDepositInWei = await casper.methods.MIN_DEPOSIT_SIZE().call({from: validatorFirst});
            // Get our deposit we just made
            let depositSize = await scenarioValidatorDepositSize(validatorFirst, validatorFirst);
            // Check that the deposit matches
            assert.equal(Number(depositSize), Number(minDepositInWei), 'validatorFirst deposit size is incorrect');
        });


        // Fail to deposit using incorrect validation contract
        it(printTitle('validatorSecond', 'fail to deposit using incorrect validation contract'), async () => {
            // Casper
            const casper = await CasperInstance();
            // Get the min deposit allowed minus 1 ether
            let minDepositInWei = parseInt(await casper.methods.MIN_DEPOSIT_SIZE().call({from: validatorSecond})) - web3.toWei(1, 'ether');
            // Deposit with Casper
            await assertThrows(scenarioValidatorDeposit(validatorSecond, minDepositInWei, validatorFirstValidationAddress, validatorSecond));
        });

        // Deposit to Casper
        it(printTitle('validatorSecond', 'makes a successful minimum deposit into Casper'), async () => {
            // Casper
            const casper = await CasperInstance();
            // Get the min deposit allowed
            let minDepositInWei = await casper.methods.MIN_DEPOSIT_SIZE().call({from: validatorSecond});
            // Deploy a validation contract for the user
            let validationTx = await sendDeployValidationContract(validatorSecond, null);
             // Save the validation contract address
             validatorSecondValidationAddress = validationTx.contractAddress;
            // Deposit with Casper
            await scenarioValidatorDeposit(validatorSecond, minDepositInWei, validatorSecondValidationAddress, validatorSecond);
        });


        // Verify deposit
        it(printTitle('validatorFirst', 'casts it vote for this epoch'), async () => {
            // Deposit with Casper
            await scenarioValidatorVote(validatorFirst, validatorFirst);
        });

    });

}
