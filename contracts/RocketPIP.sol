pragma solidity 0.4.24;

import "./lib/SafeMath.sol";
import "./RocketBase.sol";

/**
 * @title Rocket Pool Improvement Voting Process
 * @author Rocket Pool
*/

contract RocketPIP is RocketBase {
    
    using SafeMath for uint;    
    
    constructor(address _rocketStorageAddress)
        RocketBase(_rocketStorageAddress)
        public 
    {
    }

    /**
     * @notice Retrieves a submitted proposal
     * @param _proposalId Identifier of proposal to vote for
    */
    function getProposal(uint _proposalId) public view returns(uint, uint, uint)
    {
        // proposal must exist
        require(rocketStorage.getBool(keccak256(abi.encodePacked("rpip.proposal.exists", _proposalId))), "Proposal does not exist");

        return (
            rocketStorage.getUint(keccak256(abi.encodePacked("rpip.proposal.commit.end", _proposalId))),
            rocketStorage.getUint(keccak256(abi.encodePacked("rpip.proposal.reveal.end", _proposalId))),
            rocketStorage.getUint(keccak256(abi.encodePacked("rpip.proposal.quorum", _proposalId)))
        );
    }

    /**
     * @notice Retrieves the number of proposals (for iterating mostly)
    */
    function getProposalCount() public view returns(uint)
    {
        return rocketStorage.getUint(keccak256("rpip.proposal.id"));
    }
    
    /**
     * @notice Submit a proposal to start voting process
     * @param _commitEnd Commit end date
     * @param _revealEnd Reveal end date
     * @param _voteQuorum Number of votes required for proposal to pass
    */
    function submitProposal(uint _commitEnd, uint _revealEnd, uint _voteQuorum) public onlyRole("proposer") 
    {
        // Proposals can only be submitted by the proposer role

        // the commit date must be before the reveal date
        require(_commitEnd < _revealEnd, "Commit date must be before the reveal date");
        
        // voting quorum must be between 1 and 100
        require(_voteQuorum > 0 && _voteQuorum <= 100, "Voting quorum must be between 1 and 100");
        
        // increment the proposal id
        uint proposalId = rocketStorage.getUint(keccak256("rpip.proposal.id"));
        proposalId = proposalId.add(1);
        rocketStorage.setUint(keccak256("rpip.proposal.id"), proposalId);
        
        // store the proposal
        rocketStorage.setBool(keccak256(abi.encodePacked("rpip.proposal.exists", proposalId)), true);
        rocketStorage.setUint(keccak256(abi.encodePacked("rpip.proposal.commit.end", proposalId)), _commitEnd);
        rocketStorage.setUint(keccak256(abi.encodePacked("rpip.proposal.reveal.end", proposalId)), _revealEnd);
        rocketStorage.setUint(keccak256(abi.encodePacked("rpip.proposal.quorum", proposalId)), _voteQuorum);
    }

    /**
     * @notice Retrieves a voter's commitment
     * @param _proposalId Identifier of proposal to vote for
     * @param _voterAddress Address of the vote who made commitment
    */
    function getCommitment(uint _proposalId, address _voterAddress) public view returns(bytes32, uint)
    {
        // commitment must exist
        require(rocketStorage.getBool(keccak256(abi.encodePacked("rpip.commitment.exists", _proposalId, _voterAddress))), "No commitment for voter on that proposal");
        
        return (
            rocketStorage.getBytes32(keccak256(abi.encodePacked("rpip.commitment.hash", _proposalId, _voterAddress))),
            rocketStorage.getUint(keccak256(abi.encodePacked("rpip.commitment.weight", _proposalId, _voterAddress)))
        );
    }
    
    /**
     * @notice Commits a vote that is concealed until it is revealed
     * @param _proposalId Identifier of proposal to vote for
     * @param _secretHash Salted hash containing (proposalId, vote, salt)
    */
    function commitVote(uint _proposalId, bytes32 _secretHash) public
    {
        // only staking nodes are eligible to vote
        // TODO: amount node is staking is hardcoded for now until staking process is developed
        // uint256 voteWeight = rocketStorage.getUint(keccak256(abi.encodePacked("staked.ether.node", msg.sender)));
        uint256 voteWeight = 16;
        require(voteWeight > 0, "Voter is not staking ether with Rocket Pool");

        // proposal must exist
        require(rocketStorage.getBool(keccak256(abi.encodePacked("rpip.proposal.exists", _proposalId))), "Proposal does not exist");

        // must be in the commit period
        uint commitEnd = rocketStorage.getUint(keccak256(abi.encodePacked("rpip.proposal.commit.end", _proposalId)));
        require(now < commitEnd, "Cannot commit vote once reveal phase has started");
        
        // store commitment
        rocketStorage.setBool(keccak256(abi.encodePacked("rpip.commitment.exists", _proposalId, msg.sender)), true);
        rocketStorage.setBytes32(keccak256(abi.encodePacked("rpip.commitment.hash", _proposalId, msg.sender)), _secretHash);
        rocketStorage.setUint(keccak256(abi.encodePacked("rpip.commitment.weight", _proposalId, msg.sender)), voteWeight);
    }

     /**
     * @notice Retrieves a voter's revealed vote
     * @param _proposalId Identifier of proposal to vote for
     * @param _voterAddress Address of the voter who made vote
     */
    function getVote(uint _proposalId, address _voterAddress) public view returns(bool, uint)
    {
        // revealed vote must exist
        require(rocketStorage.getBool(keccak256(abi.encodePacked("rpip.voter.exists", _proposalId, _voterAddress))), "Voter has not revealed their vote");
        
        return (
            rocketStorage.getBool(keccak256(abi.encodePacked("rpip.voter.vote", _proposalId, _voterAddress))),
            rocketStorage.getUint(keccak256(abi.encodePacked("rpip.voter.weight", _proposalId, _voterAddress)))
        );
    }
    
    /**
     * @notice Reveals a vote for counting
     * @param _proposalId Identifier of proposal to vote for
     * @param _vote Boolean for or against vote
     * @param _salt Secret used to salt hash
     */
    function revealVote(uint _proposalId, bool _vote, uint _salt) public
    {
        // proposal must exist
        require(rocketStorage.getBool(keccak256(abi.encodePacked("rpip.proposal.exists", _proposalId))), "Proposal does not exist");

        // voter must have commited vote
        require(rocketStorage.getBool(keccak256(abi.encodePacked("rpip.commitment.exists", _proposalId, msg.sender))), "Voter has not commited a vote so cannot reveal");

        // must be in the reveal period
        uint commitEnd = rocketStorage.getUint(keccak256(abi.encodePacked("rpip.proposal.commit.end", _proposalId)));
        require(now >= commitEnd, "Cannot reveal during commit phase");
        uint revealEnd = rocketStorage.getUint(keccak256(abi.encodePacked("rpip.proposal.reveal.end", _proposalId)));                
        require(now < revealEnd, "Cannot reveal because voting has finished");

        // check that the vote matches the commitment
        bytes32 commitmentHash = rocketStorage.getBytes32(keccak256(abi.encodePacked("rpip.commitment.hash", _proposalId, msg.sender)));
        require(keccak256(abi.encode(_proposalId, _vote, _salt)) == commitmentHash, "Cannot reveal because vote does not match commitmented vote");

        // get voter's vote weight
        uint weight = rocketStorage.getUint(keccak256(abi.encodePacked("rpip.commitment.weight", _proposalId, msg.sender)));

        // record voter's vote
        rocketStorage.setBool(keccak256(abi.encodePacked("rpip.voter.exists", _proposalId, msg.sender)), true);
        rocketStorage.setBool(keccak256(abi.encodePacked("rpip.voter.vote", _proposalId, msg.sender)), _vote);
        rocketStorage.setUint(keccak256(abi.encodePacked("rpip.voter.weight", _proposalId, msg.sender)), weight);

        // increment votes
        string memory voteKey = _vote ? "rpip.votes.for" : "rpip.votes.against";
        uint votes = rocketStorage.getUint(keccak256(abi.encodePacked(voteKey, _proposalId)));
        votes = votes.add(weight);
        rocketStorage.setUint(keccak256(abi.encodePacked(voteKey, _proposalId)), votes);
    }

    /**
    * @notice Retrieves the number of votes FOR a particular proposal
    * @param _proposalId Identifier of proposal
    */
    function getVotesFor(uint _proposalId) public view returns(uint)
    {
        // proposal must exist
        require(rocketStorage.getBool(keccak256(abi.encodePacked("rpip.proposal.exists", _proposalId))), "Proposal does not exist");

        return rocketStorage.getUint(keccak256(abi.encodePacked("rpip.votes.for", _proposalId)));
    }


    /**
    * @notice Retrieves the number of votes AGAINST a particular proposal
    * @param _proposalId Identifier of proposal
    */
    function getVotesAgainst(uint _proposalId) public view returns(uint)
    {
        // proposal must exist
        require(rocketStorage.getBool(keccak256(abi.encodePacked("rpip.proposal.exists", _proposalId))), "Proposal does not exist");

        return rocketStorage.getUint(keccak256(abi.encodePacked("rpip.votes.against", _proposalId)));
    }

    /**
    * @notice Calculates whether the proposal passed or not
    * @param _proposalId Identifier of proposal
    */
    function isPassed(uint _proposalId) public view returns(bool)
    {
        // must be after reveal period, to ensure all votes are counted
        uint revealEnd = rocketStorage.getUint(keccak256(abi.encodePacked("rpip.proposal.reveal.end", _proposalId)));        
        require(now >= revealEnd, "Cannot count votes until the reveal phase has finished");

        // get votes (and scale to avoid division)
        uint votesFor = (rocketStorage.getUint(keccak256(abi.encodePacked("rpip.votes.for", _proposalId))) * 100);
        uint votesAgainst = (rocketStorage.getUint(keccak256(abi.encodePacked("rpip.votes.against", _proposalId))) * 100);
        // get the total ether being staked with RP
        // TODO: total staked ether is hardcoded for now until staking process is developed
        // uint totalStakedEther = rocketStorage.getUint(keccak256("staked.ether.total"));
        uint totalStakedEther = 100;
        // get the minimum percentage (as integer) of total ether staked that is required for a pass
        uint minQuorum = rocketStorage.getUint(keccak256(abi.encodePacked("rpip.proposal.quorum", _proposalId)));
        // calculate the minimum value that is required to pass
        uint minPass = totalStakedEther * minQuorum;

        // is passed if: votes meet the minimum quorum AND votes for are greater than against
        return votesFor > minPass && votesFor >= votesAgainst;
    }    
    
}