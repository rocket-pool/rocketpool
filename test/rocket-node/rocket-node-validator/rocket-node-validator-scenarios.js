import { RocketNodeValidator } from '../../artifacts';

// Casts a checkpoint vote with Casper
export async function scenarioNodeVoteCast({nodeAddress, epoch, minipoolAddress, voteMessage, gas}){
    const rocketNodeValidator = await RocketNodeValidator.deployed();

    // cast vote
    let result = await rocketNodeValidator.nodeVote(epoch, minipoolAddress, voteMessage.toString('hex'), {from: nodeAddress, gas: gas});

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

    // check parameters were correct
    let recordedMinipool = log.args.minipool_address;
    assert.equal(recordedMinipool, minipoolAddress, 'The minipool address does not match');
    let recordedLogoutMessage = log.args.logout_message;
    assert.equal(recordedLogoutMessage, logoutMessage, 'The logout message does not match');
}