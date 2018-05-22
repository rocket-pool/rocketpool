const os = require('os');
import { RocketNodeValidator, Casper, RocketPoolMini } from '../../_lib/artifacts';
import { scenarioIncrementEpoch, scenarioIncrementDynasty } from '../../casper/casper-scenarios';
import { scenarioNodeCheckin } from '../rocket-node-status/rocket-node-status-scenarios';

// Casts a checkpoint vote with Casper
export async function scenarioNodeVoteCast({nodeAddress, epoch, minipoolAddress, voteMessage, gas}){
    const rocketNodeValidator = await RocketNodeValidator.deployed();

    // cast vote
    let result = await rocketNodeValidator.minipoolVote(epoch, minipoolAddress, voteMessage.toString('hex'), {from: nodeAddress, gas: gas});

    let log = result.logs.find(({ event }) => event == 'NodeVoteCast');
    assert.isDefined(log, 'NodeVoteCast event was not logged');

    // check parameters were correct
    let recordedEpoch = log.args.epoch;
    assert.equal(recordedEpoch, epoch, 'The epoch that was voted for does not match');

    let recordedMiniPoolAddress = log.args.minipool_address;
    assert.equal(recordedMiniPoolAddress, minipoolAddress, 'The minipool address does not match');

    let recordedVoteMessage = log.args.vote_message;
    assert.equal(recordedVoteMessage, voteMessage, 'The vote message does not match');
}

export async function scenarioNodeLogout({nodeAddress, minipoolAddress, logoutMessage, gas}){
    const rocketNodeValidator = await RocketNodeValidator.deployed();

    let result = await rocketNodeValidator.minipoolLogout(minipoolAddress, logoutMessage.toString('hex'), {from: nodeAddress, gas: gas});

    let log = result.logs.find(({ event }) => event == 'NodeLogout');
    assert.isDefined(log, 'NodeLogout event was not logged');

    // Check minipool status
    let miniPool = RocketPoolMini.at(minipoolAddress);
    let miniPoolStatus = await miniPool.getStatus.call();
    assert.equal(miniPoolStatus.valueOf(), 3, 'Invalid minipool status');

    // check parameters were correct
    let recordedMinipool = log.args.minipool_address;
    assert.equal(recordedMinipool, minipoolAddress, 'The minipool address does not match');
    let recordedLogoutMessage = log.args.logout_message;
    assert.equal(recordedLogoutMessage, logoutMessage, 'The logout message does not match');
}

export async function scenarioNodeLogoutForWithdrawal({owner, nodeAddress, minipoolAddress, logoutMessage, gas}){
    const casper = await Casper.deployed();

    await scenarioNodeLogout({
        nodeAddress,
        minipoolAddress,
        logoutMessage,
        gas
    });

     // Currently default logout delay is 2 dynasties + 1 for luck
     let logoutDelayDynasties = await casper.get_dynasty_logout_delay.call({from: owner});
     for (let i = 0; i < (logoutDelayDynasties + 1); i++) {
         await scenarioIncrementEpoch(owner);
         await scenarioIncrementEpoch(owner);
         await scenarioIncrementDynasty(owner);
     }

     // Now we are logged out we have to wait for the withdrawal delay
     let withdrawalDelayEpochs = await casper.get_withdrawal_delay.call({from: owner});
     for (let i = 0; i < withdrawalDelayEpochs; i++) {
         await scenarioIncrementEpoch(owner);
     }

     // Get average CPU load
     // Our average load is determined by average load / CPU cores since it is relative to how many cores there are in a system
     // Also Solidity doesn't deal with decimals atm, so convert to a whole wei number for the load
     let averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');

     // Perform checkin, to withdraw funds from Casper
     await scenarioNodeCheckin({
         averageLoad: averageLoad15mins,
         fromAddress: nodeAddress,
     });
}