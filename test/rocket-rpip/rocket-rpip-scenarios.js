const $Web3 = require('web3');
const $web3 = new $Web3('http://localhost:8545');
import { RocketPIP } from '../_lib/artifacts';

export async function scenarioCommitVotes(proposalId, votes) {
    const rocketPIP = await RocketPIP.deployed();
    
    for (var i = 0; i < votes.length; i++){
        var voteCommitment = votes[i];
        let commitmentHash = $web3.utils.soliditySha3($web3.eth.abi.encodeParameters(['uint', 'bool', 'uint'], [proposalId, voteCommitment.vote, voteCommitment.salt]));
        await rocketPIP.commitVote(proposalId, commitmentHash, { from: voteCommitment.voterAddress });
    };
}

export async function scenarioRevealVotes(proposalId, votes) {
    const rocketPIP = await RocketPIP.deployed();
    
    for (var i = 0; i < votes.length; i++){
        var voteReveal = votes[i];
        await rocketPIP.revealVote(proposalId, voteReveal.vote, voteReveal.salt, {from: voteReveal.voterAddress });
    }
}
