const moment = require('moment');
const $Web3 = require('web3');
const $web3 = new $Web3('http://localhost:8545');

import { printTitle, assertThrows, TimeController } from '../_lib/utils/general';
import { RocketPIP } from '../_lib/artifacts';
import { setupProposerRole } from './rocket-rpip-setup';
import { scenarioCommitVotes, scenarioRevealVotes } from './rocket-rpip-scenarios';

export default function ({ owner }) {

    let rocketPIP;

    let Proposal = function (values) {
        return {
            commitDate: values[0].valueOf(),
            revealDate: values[1].valueOf(),
            voteQuorum: values[2].valueOf()
        }
    }

    let Commitment = function (values) {
        return {
            hash: values[0],
            weight: values[1].valueOf()
        }
    }

    let Vote = function (values) {
        return {
            vote: values[0],
            weight: values[1].valueOf()
        }
    }

    const submitProposalGas = 6000000;

    const timeController = TimeController;

    // default test values:
    // commit date two weeks from now, as unix epoch
    let getCommitDate = () => timeController.getCurrentTime()
                                            .add(2, 'weeks')
                                            .unix();
    // reveal date four weeks from now, as unix epoch
    let getRevealDate = () => timeController.getCurrentTime()
                                            .add(4, 'weeks')
                                            .unix();

    // vote quorum percentage, as integer
    let voteQuorum = 10; // min 10% of total ether staked to pass    

    contract('RocketPIP - submit proposals', async (accounts) => {

        // setup accounts
        let proposerAddress = accounts[1];
        let randomAddress = accounts[2];

        let commitDate;
        let revealDate;

        before(async () => {
            rocketPIP = await RocketPIP.deployed();

            commitDate = getCommitDate();
            revealDate = getRevealDate();

            await setupProposerRole({
                fromAddress: owner,
                proposerAddress: proposerAddress
            });
        });

        it(printTitle('random', 'cannot submit a proposal'), async () => {
            await assertThrows(
                rocketPIP.submitProposal(commitDate, revealDate, voteQuorum, {
                    from: randomAddress,
                    gas: submitProposalGas
                })
            );
        });

        it(printTitle('proposer', 'can submit a proposal'), async () => {
            await rocketPIP.submitProposal(commitDate, revealDate, voteQuorum, {
                from: proposerAddress,
                gas: submitProposalGas
            });

            // assert that proposal has been recorded correctly
            let proposalId = 1; // first proposal should have id 1
            let recordedProposal = Proposal(await rocketPIP.getProposal(proposalId, {
                from: owner
            }));
            assert.equal(recordedProposal.commitDate, commitDate, 'Commit date not recorded correctly');
            assert.equal(recordedProposal.revealDate, revealDate, 'Reveal date not recorded correctly');
            assert.equal(recordedProposal.voteQuorum, voteQuorum, 'Vote quorum not recorded correctly');

            // assert that proposal count has been incremented
            let proposalCount = await rocketPIP.getProposalCount();
            assert.equal(proposalCount.valueOf(), 1);
        });

        it(printTitle('proposer', 'cannot submit proposal with commit date after reveal date'), async () => {
            // commit date is after reveal
            let commitDateBad = moment().add(3, 'weeks').unix();
            let revealDateBad = moment().add(2, 'weeks').unix();

            await assertThrows(
                rocketPIP.submitProposal(commitDateBad, revealDateBad, voteQuorum, {
                    from: proposerAddress,
                    gas: submitProposalGas
                })
            );
        });

        it(printTitle('proposer', 'cannot submit proposal with negative vote quorum'), async () => {
            // negative quorum
            let voteQuorumBad = -1;
            await assertThrows(
                rocketPIP.submitProposal(commitDate, revealDate, voteQuorumBad, {
                    from: proposerAddress,
                    gas: submitProposalGas
                })
            );
        });

        it(printTitle('proposer', 'cannot submit proposal with vote quorum above 100 percent'), async () => {
            // negative quorum
            let voteQuorumBad = 101;
            await assertThrows(
                rocketPIP.submitProposal(commitDate, revealDate, voteQuorumBad, {
                    from: proposerAddress,
                    gas: submitProposalGas
                })
            );
        });
    });

    contract('RocketPIP - commit votes', async (accounts) => {
        let proposalId = 1;
        let proposerAddress = accounts[1];
        let voter1Address = accounts[2];
        let voter2Address = accounts[3];

        before(async () => {
            rocketPIP = await RocketPIP.deployed();

            await setupProposerRole({
                fromAddress: owner,
                proposerAddress: proposerAddress
            });
            await rocketPIP.submitProposal(getCommitDate(), getRevealDate(), voteQuorum, {
                from: proposerAddress,
                gas: submitProposalGas
            });
        });

        it(printTitle('voter', 'can make a vote commitment'), async () => {
            let voteWeight = 16; // hardcoded in contract for now, until staking process developed
            let vote = true;
            let salt = 1234
            let commitmentHash = $web3.utils.soliditySha3($web3.eth.abi.encodeParameters(['uint', 'bool', 'uint'], [proposalId, vote, salt]));
            await scenarioCommitVotes(proposalId, [
                { voterAddress: voter1Address, vote: vote, salt: salt }
            ]);

            var recordedCommitment = Commitment(await rocketPIP.getCommitment(proposalId, voter1Address, {
                from: owner
            }));
            assert.equal(recordedCommitment.hash, commitmentHash, "Commitment hash was not recorded correctly");
            assert.equal(recordedCommitment.weight, voteWeight, "Vote weight not recorded correctly");
        });

        it(printTitle('voter', 'cannot make a vote commitment on a non-existent proposal'), async () => {
            let nonExistentProposal = 99;
            await assertThrows(
                scenarioCommitVotes(nonExistentProposal, [
                    { voterAddress: voter1Address, vote: true, salt: 1234 }
                ])
            );
        });

        it(printTitle('voter', 'cannot commit vote after commit period finishes'), async () => {
            await timeController.addWeeks(3); // after commit period finishes, into reveal period

            await assertThrows(
                scenarioCommitVotes(proposalId, [
                    { voterAddress: voter2Address, vote: true, salt: 1234 }
                ])
            );
        });
    });

    contract('RocketPIP - reveal votes', async (accounts) => {
        let proposalId = 1;

        let proposerAddress = accounts[1];
        let voter1Address = accounts[2];
        let voter2Address = accounts[3];

        before(async () => {
            rocketPIP = await RocketPIP.deployed();

            await setupProposerRole({
                fromAddress: owner,
                proposerAddress: proposerAddress
            });
            await rocketPIP.submitProposal(getCommitDate(), getRevealDate(), voteQuorum, {
                from: proposerAddress,
                gas: submitProposalGas
            });
        });

        it(printTitle('voter', 'can reveal their vote and it is counted'), async () => {

            let voteWeight = 16;
            let votes = [
                { voterAddress: voter1Address, vote: true, salt: 1234 },
                { voterAddress: voter2Address, vote: false, salt: 4567 }
            ]

            // commit a votes
            await scenarioCommitVotes(proposalId, votes);

            // advance into reveal period
            await TimeController.addWeeks(3);

            // reveal all the votes
            await scenarioRevealVotes(proposalId, votes);

            // check recorded vote 1
            let recordedVote1 = Vote(await rocketPIP.getVote(proposalId, votes[0].voterAddress));
            assert.equal(recordedVote1.vote, votes[0].vote, 'vote not recorded correctly');
            assert.equal(recordedVote1.weight, voteWeight, 'weight not recorded correctly');

            // check recorded vote 2
            let recordedVote2 = Vote(await rocketPIP.getVote(proposalId, voter2Address));
            assert.equal(recordedVote2.vote, votes[1].vote, 'vote not recorded correctly');
            assert.equal(recordedVote2.weight, voteWeight, 'weight not recorded correctly');

            // check votes are counted
            let votesFor = await rocketPIP.getVotesFor(proposalId);
            assert.equal(votesFor.valueOf(), voteWeight);
            let votesAgainst = await rocketPIP.getVotesAgainst(proposalId);
            assert.equal(votesAgainst.valueOf(), voteWeight);
        });

        it(printTitle('voter', 'cannot reveal a vote if they haven\'t committed'), async () => {
            // submit a new proposal
            await rocketPIP.submitProposal(getCommitDate(), getRevealDate(), voteQuorum, {
                from: proposerAddress,
                gas: submitProposalGas
            });

            // new proposal has new id
            proposalId += 1;

            // advance into reveal period
            await TimeController.addWeeks(3);

            // reveal vote without first committing
            await assertThrows(
                scenarioRevealVotes(proposalId, [{voterAddress: voter1Address, vote: true, salt: 1234}])
            );
        });

        it(printTitle('voter', 'cannot reveal a vote for a non-existent proposal'), async () => {
            // reveal vote on a proposal that doesn't exist
            await assertThrows(
                scenarioRevealVotes(99, [{voterAddress: voter1Address, vote: true, salt: 1234}])
            );
        });

        it(printTitle('voter', 'cannot reveal a vote before reveal period'), async () => {
            // submit a new proposal
            await rocketPIP.submitProposal(getCommitDate(), getRevealDate(), voteQuorum, {
                from: proposerAddress,
                gas: submitProposalGas
            });

            // new proposal has new id
            proposalId += 1;

            // commit a vote
            let voteCommitment = {voterAddress: voter1Address, vote: true, salt: 1234};           
            await scenarioCommitVotes(proposalId, [voteCommitment]);

            // attempt to reveal vote in commit period
            await assertThrows(
                scenarioRevealVotes(proposalId, [voteCommitment])
            );
        });

        it(printTitle('voter', 'cannot reveal a vote after reveal period'), async () => {
            // submit a new proposal
            await rocketPIP.submitProposal(getCommitDate(), getRevealDate(), voteQuorum, {
                from: proposerAddress,
                gas: submitProposalGas
            });

            // new proposal has new id
            proposalId += 1;

            // commit a vote
            let voteCommitment = {voterAddress: voter1Address, vote: true, salt: 1234};           
            await scenarioCommitVotes(proposalId, [voteCommitment]);        

            // advance past reveal period
            await TimeController.addWeeks(5);

            // attempt to reveal vote after reveal period has finished
            await assertThrows(
                scenarioRevealVotes(proposalId, [voteCommitment])
            );
        });

        it(printTitle('voter', 'cannot reveal vote if it doesn\'t match commited vote'), async () => {
            // submit a new proposal
            await rocketPIP.submitProposal(getCommitDate(), getRevealDate(), voteQuorum, {
                from: proposerAddress,
                gas: submitProposalGas
            });

            // new proposal has new id
            proposalId += 1;

            // commit a vote
            let voteCommitment = {voterAddress: voter1Address, vote: true, salt: 1234};           
            await scenarioCommitVotes(proposalId, [voteCommitment]);

            // advance to reveal period
            await TimeController.addWeeks(3);

            // attempt to reveal vote that doesn't match commitment
            await assertThrows(
                scenarioRevealVotes(proposalId, [{voterAddress: voter1Address, vote: false, salt: 1234}])
            );
        });

    });

    contract('RocketPIP - vote outcomes', async (accounts) => {

        let proposalId = 1;

        let proposerAddress = accounts[1];
        let voter1Address = accounts[2];
        let voter2Address = accounts[3];
        let voter3Address = accounts[4];

        before(async () => {
            rocketPIP = await RocketPIP.deployed();

            await setupProposerRole({
                fromAddress: owner,
                proposerAddress: proposerAddress
            });
        });

        it(printTitle('outcome', 'is passed, if votes for are greater than those against'), async () => {
            // submit new proposal
            await rocketPIP.submitProposal(getCommitDate(), getRevealDate(), voteQuorum, {
                from: proposerAddress,
                gas: submitProposalGas
            });

            // votes FOR out number those AGAINST
            let votes = [
                { voterAddress: voter1Address, vote: true, salt: 1234 },
                { voterAddress: voter2Address, vote: true, salt: 4567 },
                { voterAddress: voter3Address, vote: false, salt: 9874 }
            ]

            // commit a votes
            await scenarioCommitVotes(proposalId, votes);           

            // advance into reveal period
            await TimeController.addWeeks(3);

            // reveal votes
            await scenarioRevealVotes(proposalId, votes);

            // advance after reveal period
            await TimeController.addWeeks(3);

            let isPassed = await rocketPIP.isPassed(proposalId);
            assert.isTrue(isPassed);
        });

        it(printTitle('outcome', 'is not passed, if votes for are less than those against'), async () => {
            // submit a proposal
            await rocketPIP.submitProposal(getCommitDate(), getRevealDate(), voteQuorum, {
                from: proposerAddress,
                gas: submitProposalGas
            });

            // new proposal has new id
            proposalId += 1;

            // votes AGAINST out number those FOR
            let votes = [
                { voterAddress: voter1Address, vote: true, salt: 1234 },
                { voterAddress: voter2Address, vote: false, salt: 4567 },
                { voterAddress: voter3Address, vote: false, salt: 9874 }
            ]

            // commit a votes
            await scenarioCommitVotes(proposalId, votes);           

            // advance into reveal period
            await TimeController.addWeeks(3);

            // reveal votes
            await scenarioRevealVotes(proposalId, votes);

            // advance after reveal period
            await TimeController.addWeeks(3);

            // should not pass because there are more votes against
            let isPassed = await rocketPIP.isPassed(proposalId);
            assert.isFalse(isPassed);
        });

        it(printTitle('outcome', 'is not passed, if votes for are less than minimum quorum'), async () => {
            // set a high quorum - 99% of all total ether staked must vote to accept the proposal for it to pass.
            let quorum = 99;
            await rocketPIP.submitProposal(getCommitDate(), getRevealDate(), quorum, {
                from: proposerAddress,
                gas: submitProposalGas
            });

            // new proposal has new id
            proposalId += 1;

            let voteCommitment = { voterAddress: voter1Address, vote: true, salt: 1234 };

            // commit a votes
            await scenarioCommitVotes(proposalId, [voteCommitment]);

            // advance into reveal period
            await TimeController.addWeeks(3);

            // reveal votes
            await scenarioRevealVotes(proposalId, [voteCommitment]);

            // advance after reveal period
            await TimeController.addWeeks(3);

            // should not pass because votes for are less than the necessary quorum size
            let isPassed = await rocketPIP.isPassed(proposalId);
            assert.isFalse(isPassed);
        });
    });
}