const $Web3 = require('web3');
const $web3 = new $Web3('http://localhost:8545');
const BN = require('bn.js');
const RLP = require('rlp');

import signRaw from '../_lib/utils/sign';
import { mineBlockAmount, rlpEncode, getGanachePrivateKey, removeTrailing0x, paddy, soliditySha3, floorDiv } from '../_lib/utils/general';
import { CasperValidation } from '../_lib/artifacts';
import { CasperInstance, casperEpochIncrementAmount } from '../_lib/casper/casper';


// Retrieve BASE_PENALTY_FACTOR which is a DECIMAL10 attribute and should be greater than 0 but less than 1
export async function scenarioVerifyDecimal10(fromAddress) {
    let casper = await CasperInstance();
    let result = await casper.methods.BASE_PENALTY_FACTOR().call({from: fromAddress});
    assert.isTrue(result > 0 && result < 1, 'Verified Casper DECIMAL10 is a float');
}

// The current Epoch is the expected epoch
export async function scenarioEpochIsCurrent(fromAddress) {
    // Casper
    const casper = await CasperInstance();
    // Get the current epoch
    let epochCurrent = await casper.methods.current_epoch().call({from: fromAddress});
    // Get the current epoch length
    let epochBlockLength = await casper.methods.EPOCH_LENGTH().call({from: fromAddress});
    // Get the current block number
    let blockCurrent = web3.eth.blockNumber;
    // This would be the current epoch we expect
    let epochExpected = Math.floor(blockCurrent/epochBlockLength);
    assert.equal(epochExpected, epochCurrent, 'Casper epoch is not current');
}

// Increments Casper epoch and asserts current epoch is set correctly
export async function scenarioIncrementEpochAndInitialise(fromAddress, amount) {
    // Casper
    const casper = await CasperInstance();
    // Get the current epoch
    let epochCurrent = await casper.methods.current_epoch().call({from: fromAddress});
    await casperEpochIncrementAmount(fromAddress, amount);
    // Get the current epoch after
    let epochCurrentAfter = await casper.methods.current_epoch().call({from: fromAddress});
    assert.equal(parseInt(epochCurrentAfter), parseInt(epochCurrent) + parseInt(amount), 'Updated Casper epoch does not match');
}

// An address makes a deposit into Casper
export async function scenarioValidatorDeposit(fromAddress, amountInWei, validationAddr, withdrawalAddr) {
    // Casper
    const casper = await CasperInstance();
    let tx = await casper.methods.deposit(validationAddr, withdrawalAddr).send({
        from: fromAddress, 
        gas: 3750000, 
        gasPrice: '20000000000',
        value: amountInWei
    });
    assert.equal(tx.events.Deposit.returnValues._from.toLowerCase(), withdrawalAddr.toLowerCase(), 'Casper deposit failed and has incorrect fromAddress');
}

// Get a validators deposit size
export async function scenarioValidatorDepositSize(fromAddress, validatorWithdrawalAddress) {
    // Casper
    const casper = await CasperInstance();
    // Get the current validator index
    let validatorIndex = await casper.methods.validator_indexes(validatorWithdrawalAddress).call({from: fromAddress});
    // Now get the deposit size
    let validatorDepositSize = await casper.methods.deposit_size(validatorIndex).call({from: fromAddress});
    assert.isTrue(parseInt(validatorDepositSize) >= 0, 'Casper validator deposit size is invalid');
    return validatorDepositSize;
}


// Vote for a validator
export async function scenarioValidatorVote({validatorAddress, validatorWithdrawalAddress = validatorAddress, signingAddress = validatorAddress}) {
    // Casper
    const casper = await CasperInstance();
    // Get the current validator index and vote
    let validatorIndex = parseInt(await casper.methods.validator_indexes(validatorWithdrawalAddress).call({from: validatorAddress}));
    let casperCurrentEpoch = parseInt(await casper.methods.current_epoch().call({from: validatorAddress}));
    let targetHash = Buffer.from(removeTrailing0x(await casper.methods.recommended_target_hash().call({from: validatorAddress})), 'hex');
    let sourceEpoch = parseInt(await casper.methods.recommended_source_epoch().call({from: validatorAddress}));

    // Verify data ok
    assert.isTrue(casperCurrentEpoch >= 0, 'Casper current epoch is invalid');
    assert.isTrue(targetHash.length > 25, 'Casper target hash is invalid');
    assert.isTrue(sourceEpoch >= 0 && sourceEpoch < casperCurrentEpoch, 'Casper source epoch is invalid');

    let validatorDepositBefore = await casper.methods.validators__deposit(validatorIndex).call({from: validatorAddress});
    assert.isTrue(validatorDepositBefore > 0, 'Validators deposit should be greater than 0');

    // RLP encode the required vote message
    let sigHash = $web3.utils.keccak256(RLP.encode([validatorIndex,targetHash,casperCurrentEpoch,sourceEpoch]));
    // Sign it
    let signature = signRaw(sigHash, getGanachePrivateKey(signingAddress));
    // Combine and pad to 32 int length (same as casper python code)
    let combinedSig = Buffer.from(paddy(signature.v, 64) + paddy(signature.r, 64) +  paddy(signature.s, 64), 'hex');
    // RLP encode the message params now
    let voteMessage = RLP.encode([validatorIndex, targetHash, casperCurrentEpoch, sourceEpoch, combinedSig]);
    // Estimate gas for vote transaction
    let voteGas = await casper.methods.vote('0x'+voteMessage.toString('hex')).estimateGas({ from: validatorAddress });
    
    let tx = await casper.methods.vote('0x'+voteMessage.toString('hex')).send({
        from: validatorAddress, 
        gas: voteGas + 10000, 
        gasPrice: '20000000000'
    });

    /*** Assert that vote was made */

    // create a bitmask to identify whether the vote was counted correctly
    let bitMask = 1 << (validatorIndex % 256);
    // get the vote bitmap to check
    let voteBitmap = await casper.methods.checkpoints__vote_bitmap(casperCurrentEpoch, floorDiv(validatorIndex, 256)).call({from: validatorAddress});
    // compare to the bitmask
    let bitResult = bitMask & voteBitmap;
    // if it comes back 0 then the vote was not correct
    assert.isTrue(bitResult > 0);

    /*** Assert that reward was processed */

    // Reward is only given once current and previous dynasties have deposits (after 2nd dynasty)
    let rewardFactor = await casper.methods.reward_factor().call({from: validatorAddress});
    if (rewardFactor > 0) {        
        let validatorDepositAfter = await casper.methods.validators__deposit(validatorIndex).call({from: validatorAddress});
        assert.isTrue(validatorDepositAfter > validatorDepositBefore);
    }

}

// Creates validation contract and asserts contract was created successfully
export async function scenarioCreateValidationContract({fromAddress}) {

    // Create a blank contract for use in making validation address contracts
    // 500k gas limit @ 10 gwei TODO: Make these configurable on the smart node package by reading from RocketSettings contract so we can adjust when needed
    const valCodeContract = await CasperValidation.new({gas: 500000, gasPrice: 10000000000, from: fromAddress});

    // Assert that contract was created successfully
    assert.notEqual(valCodeContract.address, 0, 'Validation contract creation failed');

    // Return validation contract address
    return valCodeContract.address;

}

export async function scenarioValidatorLogout({validatorAddress, validatorWithdrawalAddress = validatorAddress, signingAddress = validatorAddress}){
    // Casper
    const casper = await CasperInstance();

    let validatorIndex = parseInt(await casper.methods.validator_indexes(validatorWithdrawalAddress).call({from: validatorAddress}));
    let casperCurrentEpoch = parseInt(await casper.methods.current_epoch().call({from: validatorAddress}));

    let validatorEndDynastyBefore = new BN(await casper.methods.validators__end_dynasty(validatorIndex).call({from: validatorAddress}));

    // RLP encode the required logout message
    let sigHash = $web3.utils.keccak256(RLP.encode([validatorIndex, casperCurrentEpoch]));
    // Sign it
    let signature = signRaw(sigHash, getGanachePrivateKey(signingAddress));
    // Combine and pad to 32 int length (same as casper python code)
    let combinedSig = Buffer.from(paddy(signature.v, 64) + paddy(signature.r, 64) +  paddy(signature.s, 64), 'hex');
    // RLP encode the message params now
    let logoutMessage = RLP.encode([validatorIndex, casperCurrentEpoch, combinedSig]);

    let logoutGas = await casper.methods.logout('0x'+logoutMessage.toString('hex')).estimateGas({from: validatorAddress});

    let tx = await casper.methods.logout('0x'+logoutMessage.toString('hex'))
                                .send({
                                    from: validatorAddress, 
                                    gas: logoutGas + 10000, 
                                    gasPrice: '20000000000'
                                });

    // Check logout tx status
    assert.isTrue(tx.status == 1, 'Logout transaction was not successful');

    // Check that the end dynasty of the validator has been reduced because they are logging out (dynasty + logout delay)
    let validatorEndDynastyAfter = new BN(await casper.methods.validators__end_dynasty(validatorIndex).call({from: validatorAddress}));
    assert.isTrue(validatorEndDynastyAfter.lt(validatorEndDynastyBefore), 'Validator\'s end dynasty should be lower because they have logged out');
}

export async function scenarioValidatorWithdraw({validatorAddress, validatorWithdrawalAddress = validatorAddress}){
    // Casper
    const casper = await CasperInstance();

    // Precheck make sure withdrawal address has a 0 balance
    let balanceBefore = new BN(await $web3.eth.getBalance(validatorWithdrawalAddress));
    assert.isTrue(balanceBefore == 0);

    let validatorIndex = parseInt(await casper.methods.validator_indexes(validatorWithdrawalAddress).call({from: validatorAddress}));
    let validatorDeposit = new BN(await casper.methods.validators__deposit(validatorIndex).call({from: validatorAddress}));
    
    let withdrawalGas = await casper.methods.withdraw(validatorIndex).estimateGas({from: validatorAddress});
    let tx = await casper.methods.withdraw(validatorIndex)
                                .send({
                                    from: validatorAddress, 
                                    gas: withdrawalGas + 60000, 
                                    gasPrice: '20000000000'
                                });

    // Check logout tx status
    assert.isTrue(tx.status == 1, 'Withdraw transaction was not successful');
   
    let balanceAfter = new BN(await $web3.eth.getBalance(validatorWithdrawalAddress));
    assert.isTrue(balanceAfter.gt(validatorDeposit), 'Deposit + reward funds have not be sent to withdrawal address');
}