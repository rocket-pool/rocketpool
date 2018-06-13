const os = require('os');
const $Web3 = require('web3');
const $web3 = new $Web3('http://localhost:8545');
const BN = require('bn.js');
const RLP = require('rlp');

const _ = require('underscore')._;

import signRaw from '../../_lib/utils/sign';
import { RocketNodeValidator, Casper, RocketPoolMini } from '../../_lib/artifacts';
import { getGanachePrivateKey, paddy, removeTrailing0x, mineBlockAmount } from '../../_lib/utils/general';
import { CasperInstance, casperEpochInitialise, casperEpochIncrementAmount } from '../../_lib/casper/casper';
import { scenarioNodeCheckin } from '../rocket-node-status/rocket-node-status-scenarios';

// Casts a checkpoint vote with Casper
export async function scenarioNodeVoteCast({nodeAddress, minipoolAddress, gas, signingAddress = nodeAddress, emptyVoteMessage = false, gotoEpochSecondQuarter = true, expectCanVote}){
    const casper = await CasperInstance();
    const rocketNodeValidator = await RocketNodeValidator.deployed();

    // Get the current validator index and vote    
    let currentEpoch = parseInt(await casper.methods.current_epoch().call({from: nodeAddress}));
    let validatorIndex = parseInt(await casper.methods.validator_indexes(minipoolAddress).call({from: nodeAddress}));
    let targetHash = Buffer.from(removeTrailing0x(await casper.methods.recommended_target_hash().call({from: nodeAddress})), 'hex');
    let sourceEpoch = parseInt(await casper.methods.recommended_source_epoch().call({from: nodeAddress}));
    
    // RLP encode the required vote message
    let sigHash = $web3.utils.keccak256(RLP.encode([validatorIndex,targetHash,currentEpoch,sourceEpoch]));
    // Sign it
    let signature = signRaw(sigHash, getGanachePrivateKey(signingAddress));
    // Combine and pad to 32 int length (same as casper python code)
    let combinedSig = Buffer.from(paddy(signature.v, 64) + paddy(signature.r, 64) +  paddy(signature.s, 64), 'hex');
    // RLP encode the message params now
    let voteMessage = !emptyVoteMessage ? RLP.encode([validatorIndex, targetHash, currentEpoch, sourceEpoch, combinedSig]) : '';

    // Proceed to second quarter of epoch to allow voting
    if (gotoEpochSecondQuarter) {
        let blockNumber = parseInt(await $web3.eth.getBlockNumber());
        let epochLength = parseInt(await casper.methods.EPOCH_LENGTH().call({from: nodeAddress}));
        let epochBlockNumber = blockNumber % epochLength;
        let epochFirstQuarter = Math.floor(epochLength / 4);
        let blockAmount = (epochFirstQuarter - epochBlockNumber) + 1;
        if (blockAmount > 0) await mineBlockAmount(blockAmount);
    }

    // Check whether minipool can vote
    if (expectCanVote !== undefined) {
        let miniPool = RocketPoolMini.at(minipoolAddress);
        let canVote = await miniPool.getCanVote.call();
        assert.equal(canVote, expectCanVote, (expectCanVote ? 'Minipool was unable to vote when expected to be able' : 'Minipool was able to vote when expected to be unable'));
    }

    // cast vote
    let result = await rocketNodeValidator.minipoolVote(currentEpoch, minipoolAddress, '0x'+voteMessage.toString('hex'), {from: nodeAddress, gas: gas});

    let log = result.logs.find(({ event }) => event == 'NodeVoteCast');
    assert.isDefined(log, 'NodeVoteCast event was not logged');

    // check parameters were correct
    let recordedEpoch = log.args.epoch;
    assert.equal(recordedEpoch, currentEpoch, 'The epoch that was voted for does not match');

    let recordedMiniPoolAddress = log.args.minipool_address;
    assert.equal(recordedMiniPoolAddress, minipoolAddress, 'The minipool address does not match');

    let recordedVoteMessage = log.args.vote_message;
    assert.equal(recordedVoteMessage, '0x'+voteMessage.toString('hex'), 'The vote message does not match');
}

export async function scenarioNodeLogout({nodeAddress, minipoolAddress, gas, signingAddress = nodeAddress}){
    const rocketNodeValidator = await RocketNodeValidator.deployed();

    // Casper
    const casper = await CasperInstance();

    // get the current validator index and epoch for logout message
    let validatorIndex = parseInt(await casper.methods.validator_indexes(minipoolAddress).call({from: nodeAddress}));
    let currentEpoch = parseInt(await casper.methods.current_epoch().call({from: nodeAddress}));

    // build logout message
    let sigHash = $web3.utils.keccak256(RLP.encode([validatorIndex, currentEpoch]));
    let signature = signRaw(sigHash, getGanachePrivateKey(signingAddress));
    let combinedSig = Buffer.from(paddy(signature.v, 64) + paddy(signature.r, 64) +  paddy(signature.s, 64), 'hex');
    let logoutMessage = RLP.encode([validatorIndex, currentEpoch, combinedSig]);

    // call node validator to logout
    let result = await rocketNodeValidator.minipoolLogout(minipoolAddress, '0x'+logoutMessage.toString('hex'), {from: nodeAddress, gas: gas});

    // did the logout event fire?
    let log = result.logs.find(({ event }) => event == 'NodeLogout');
    assert.isDefined(log, 'NodeLogout event was not logged');

    // check minipool status
    let miniPool = RocketPoolMini.at(minipoolAddress);
    let miniPoolStatus = await miniPool.getStatus.call();
    assert.equal(miniPoolStatus.valueOf(), 3, 'Invalid minipool status');

    // check parameters were correct
    let recordedMinipool = log.args.minipool_address;
    assert.equal(recordedMinipool, minipoolAddress, 'The minipool address does not match');
    let recordedLogoutMessage = log.args.logout_message;
    assert.equal(recordedLogoutMessage, '0x'+logoutMessage.toString('hex'), 'The logout message does not match');
}

export async function scenarioNodeLogoutForWithdrawal({owner, validators, nodeAddress, minipoolAddress, gas}){
    const casper = await CasperInstance();

    // Vote so that the epoch justifies/finalises
    for (let index = 0; index < 6; index++) {
        for (const validator of validators) {
            await scenarioNodeVoteCast({
                nodeAddress: validator.nodeAddress,
                minipoolAddress: validator.minipoolAddress,
                gas: gas
            });                            
        }
        // Mine to next epoch
        await casperEpochIncrementAmount(owner, 1);
    }

    // log out the node
    await scenarioNodeLogout({
        nodeAddress,
        minipoolAddress,
        gas
    });

    // Vote so that the epoch justifies/finalises
    for (const validator of validators) {
        await scenarioNodeVoteCast({
            nodeAddress: validator.nodeAddress,
            minipoolAddress: validator.minipoolAddress,
            gas: gas
        });            
    }

    // Mine to the next epoch
    await casperEpochIncrementAmount(owner, 1);   

    // Currently default logout delay is 2 dynasties
    let logoutDelayDynasties = parseInt(await casper.methods.DYNASTY_LOGOUT_DELAY().call({from: owner}));
    for (let i = 0; i < logoutDelayDynasties; i++) {

        for (const validator of validators) {
            // Vote so that the epoch justifies/finalises
            await scenarioNodeVoteCast({
                nodeAddress: validator.nodeAddress,
                minipoolAddress: validator.minipoolAddress,
                gas: gas
            });            
        }

        // Mine to the next epoch
        await casperEpochIncrementAmount(owner, 1);   

    } 

    // Now we are logged out we have to wait for the withdrawal delay
    let withdrawalDelayEpochs = parseInt(await casper.methods.WITHDRAWAL_DELAY().call({from: owner}));
    for (let i = 0; i < (withdrawalDelayEpochs + 1); i++) {
   
        // Mine to the next epoch                 
        await casperEpochIncrementAmount(owner, 1);

        let validatorsExcludingLoggedOut = _.reject(validators, (v) => v.minipoolAddress == minipoolAddress);
        for (const validator of validatorsExcludingLoggedOut) {
            // Vote so that the epoch justifies/finalises
            await scenarioNodeVoteCast({
                nodeAddress: validator.nodeAddress,
                minipoolAddress: validator.minipoolAddress,
                gas: gas
            });            
        }
    
    }

    // Mine next epoch
    await casperEpochIncrementAmount(owner, 1);

    // Get average CPU load
    // Our average load is determined by average load / CPU cores since it is relative to how many cores there are in a system
    // Also Solidity doesn't deal with decimals atm, so convert to a whole wei number for the load
    let averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');

    //  Perform checkin, to withdraw funds from Casper
    await scenarioNodeCheckin({
        averageLoad: averageLoad15mins,
        fromAddress: nodeAddress,
    });        

    let isMinipoolClosed = (await web3.eth.getCode(minipoolAddress)) == '0x0';
    if(!isMinipoolClosed){
        // Check that the minipool has completed withdrawal from Casper
        let miniPool = RocketPoolMini.at(minipoolAddress);
        let miniPoolStatus = await miniPool.getStatus.call();
        assert.equal(miniPoolStatus.valueOf(), 4, 'Invalid minipool status - should have completed withdrawal from Casper');
    }    

}