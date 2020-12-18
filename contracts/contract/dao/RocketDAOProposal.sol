pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/dao/RocketDAOInterface.sol";
import "../../interface/dao/RocketDAOProposalInterface.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";


// A DAO proposal
contract RocketDAOProposal is RocketBase, RocketDAOProposalInterface {

    using SafeMath for uint;

    // Events
    event ProposalAdded(address indexed proposer, string indexed proposalDAO, uint256 indexed proposalID, bytes payload, uint256 time);  
    event ProposalVoted(uint256 indexed proposalID, address indexed voter, bool indexed supported, uint256 time);  
    event ProposalExecuted(uint256 indexed proposalID, address indexed executer, uint256 time);
    event ProposalCancelled(uint256 indexed proposalID, address indexed canceller, uint256 time);    

    // Calculate using this as the base
    uint256 calcBase = 1 ether;

    // The namespace for any data stored in the trusted node DAO (do not change)
    string daoProposalNameSpace = 'dao.proposal';

    
    // Only allow the DAO contract to access
    modifier onlyDAOContract(string memory _daoName) {
        // TODO: Potentially lock this down to final DAO contract names
        // Load contracts
        require(keccak256(abi.encodePacked(getContractName(msg.sender))) == keccak256(abi.encodePacked(_daoName)), "Sender is not the required DAO contract");
        _;
    }


    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }


    /*** Proposals ****************/
  
    // Get the current total proposals
    function getTotal() override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoProposalNameSpace, "total"))); 
    }

    // Get the DAO that this proposal belongs too
    function getDAO(uint256 _proposalID) override public view returns (string memory) { 
        return getString(keccak256(abi.encodePacked(daoProposalNameSpace, "dao", _proposalID))); 
    }

    // Get the member who proposed
    function getProposer(uint256 _proposalID) override public view returns (address) {
        return getAddress(keccak256(abi.encodePacked(daoProposalNameSpace, "proposer", _proposalID))); 
    }

    // Get the start block of this proposal
    function getStart(uint256 _proposalID) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoProposalNameSpace, "start", _proposalID))); 
    } 

    // Get the end block of this proposal
    function getEnd(uint256 _proposalID) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoProposalNameSpace, "end", _proposalID))); 
    }

    // The block that the proposal will be available for execution, set once the vote succeeds
    function getETA(uint256 _proposalID) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoProposalNameSpace, "eta", _proposalID))); 
    }

    // Get the created status of this proposal
    function getCreated(uint256 _proposalID) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoProposalNameSpace, "created", _proposalID))); 
    }

    // Get the votes for count of this proposal
    function getVotesFor(uint256 _proposalID) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoProposalNameSpace, "votes.for", _proposalID))); 
    }

    // Get the votes against count of this proposal
    function getVotesAgainst(uint256 _proposalID) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoProposalNameSpace, "votes.against", _proposalID))); 
    }

    // Get the cancelled status of this proposal
    function getCancelled(uint256 _proposalID) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked(daoProposalNameSpace, "cancelled", _proposalID))); 
    }

    // Get the executed status of this proposal
    function getExecuted(uint256 _proposalID) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked(daoProposalNameSpace, "executed", _proposalID))); 
    }

    // Get the votes against count of this proposal
    function getPayload(uint256 _proposalID) override public view returns (bytes memory) {
        return getBytes(keccak256(abi.encodePacked(daoProposalNameSpace, "payload", _proposalID))); 
    }

    // Returns true if this proposal has already been voted on by a member
    function getReceiptHasVoted(uint256 _proposalID, address _nodeAddress) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked(daoProposalNameSpace, "receipt.hasVoted", _proposalID, _nodeAddress))); 
    }

    // Returns true if this proposal was supported by this member
    function getReceiptSupported(uint256 _proposalID, address _nodeAddress) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked(daoProposalNameSpace, "receipt.supported", _proposalID, _nodeAddress))); 
    }
    

    // Return the state of the specified proposal
    function getState(uint256 _proposalID) override public view returns (ProposalState) {
        // Load contracts
        RocketDAOInterface dao = RocketDAOInterface(getContractAddress(getDAO(_proposalID)));
        // Check the proposal ID is legit
        require(getTotal() >= _proposalID && _proposalID > 0, "Invalid proposal ID");
        // Get the amount of votes for and against
        uint256 votesFor = getVotesFor(_proposalID);
        uint256 votesAgainst = getVotesAgainst(_proposalID);
        // Now return the state of the current proposal
        if (getCancelled(_proposalID)) {
            // Cancelled by the proposer?
            return ProposalState.Cancelled;
            // Has it been executed?
        } else if (getExecuted(_proposalID)) {
            return ProposalState.Executed;
            // Is the proposal pending? Eg. waiting to be voted on
        } else if (block.number <= getStart(_proposalID)) {
            return ProposalState.Pending;
            // The proposal is active and can be voted on
        } else if (block.number <= getEnd(_proposalID)) {
            return ProposalState.Active;
            // Check the votes, was it defeated?
        } else if (votesFor <= votesAgainst || votesFor < dao.getProposalQuorumVotesRequired()) {
            return ProposalState.Defeated;
            // Has it expired?
        } else if (block.number >= getEnd(_proposalID).add(dao.getSettingUint('proposal.execute.blocks'))) {
            return ProposalState.Expired;
        } else {
            // Vote was successful, is now awaiting execution
            return ProposalState.Succeeded;
        }
    }


    // Add a proposal to the an RP DAO, immeditately becomes active
    // Calldata is passed as the payload to execute upon passing the proposal
    function add(string memory _proposalDAO, string memory _proposalMessage, bytes memory _payload) override public onlyDAOContract(_proposalDAO) returns (uint256) {
        // Load contracts
        RocketDAOInterface dao = RocketDAOInterface(msg.sender);
        // Get the total proposal count
        uint256 proposalCount = getTotal(); 
        // Get the proposal ID
        uint256 proposalID = proposalCount.add(1);
        // The data structure for a proposal
        setString(keccak256(abi.encodePacked(daoProposalNameSpace, "dao", proposalID)), _proposalDAO);
        setString(keccak256(abi.encodePacked(daoProposalNameSpace, "message", proposalID)), _proposalMessage);
        setAddress(keccak256(abi.encodePacked(daoProposalNameSpace, "proposer", proposalID)), msg.sender);
        setUint(keccak256(abi.encodePacked(daoProposalNameSpace, "start", proposalID)), block.number.add(dao.getSettingUint('proposal.vote.delay.blocks')));
        setUint(keccak256(abi.encodePacked(daoProposalNameSpace, "end", proposalID)), block.number.add(dao.getSettingUint('proposal.vote.blocks')));
        setUint(keccak256(abi.encodePacked(daoProposalNameSpace, "created", proposalID)), block.number);
        setUint(keccak256(abi.encodePacked(daoProposalNameSpace, "votes.for", proposalID)), 0);
        setUint(keccak256(abi.encodePacked(daoProposalNameSpace, "votes.against", proposalID)), 0);
        setBool(keccak256(abi.encodePacked(daoProposalNameSpace, "cancelled", proposalID)), false);
        setBool(keccak256(abi.encodePacked(daoProposalNameSpace, "executed", proposalID)), false);
        setBytes(keccak256(abi.encodePacked(daoProposalNameSpace, "payload", proposalID)), _payload);
        // Update the total proposals
        setUint(keccak256(abi.encodePacked(daoProposalNameSpace, "total")), proposalID);
        // Log it
        emit ProposalAdded(msg.sender, _proposalDAO, proposalID, _payload, now);
        // Done
        return proposalID;
    }


    // Voting for or against a proposal
    function vote(address _member, uint256 _votes, uint256 _proposalID, bool _support) override public onlyDAOContract(getDAO(_proposalID)) {
        // Check the proposal is in a state that can be voted on
        require(getState(_proposalID) == ProposalState.Active, "Voting is not active for this proposal");
        // Has this member already voted on this proposal?
        require(!getReceiptHasVoted(_proposalID, _member), "Member has already voted on proposal");
        // Add votes to proposal
        if(_support) {
            setUint(keccak256(abi.encodePacked(daoProposalNameSpace, "votes.for", _proposalID)), getVotesFor(_proposalID).add(_votes));
        }else{
            setUint(keccak256(abi.encodePacked(daoProposalNameSpace, "votes.against", _proposalID)), getVotesAgainst(_proposalID).add(_votes));
        }
        // Record the vote receipt now
        setUint(keccak256(abi.encodePacked(daoProposalNameSpace, "receipt.votes", _proposalID, _member)), _votes);
        setBool(keccak256(abi.encodePacked(daoProposalNameSpace, "receipt.hasVoted", _proposalID, _member)), true);
        setBool(keccak256(abi.encodePacked(daoProposalNameSpace, "receipt.supported", _proposalID, _member)), _support);
        // Log it
        emit ProposalVoted(_proposalID, _member, _support, now);
    }
    

    // Execute a proposal if it has passed
    // Anyone can run this if they are willing to pay the gas costs for it
    function execute(uint256 _proposalID) override public {
        // Firstly make sure this proposal has passed
        require(getState(_proposalID) == ProposalState.Succeeded, "Proposal has not succeeded, has expired or has already been executed");
        // Set as executed now before running payload
        setBool(keccak256(abi.encodePacked(daoProposalNameSpace, "executed", _proposalID)), true);
        // Ok all good, lets run the payload on the dao contract that the proposal relates too, it should execute one of the methods on this contract
        (bool success, bytes memory response) = getContractAddress(getDAO(_proposalID)).call(getPayload(_proposalID));
        // Was there an error?
        require(success, getRevertMsg(response));
        // Log it
        emit ProposalExecuted(_proposalID, msg.sender, now);
    }


    // Cancel a proposal, can be cancelled by the original proposer only if it hasn't been executed yet
    function cancel(uint256 _proposalID) override public onlyDAOContract(getDAO(_proposalID)) {
        // Firstly make sure this proposal that hasn't already been executed
        require(getState(_proposalID) != ProposalState.Executed, "Proposal has not succeeded or has already been executed");
        // Only allow the proposer to cancel
        require(getProposer(_proposalID) == msg.sender, "Proposal can only be cancelled by the proposer");
        // Set as cancelled now
        setBool(keccak256(abi.encodePacked(daoProposalNameSpace, "cancelled", _proposalID)), true);
        // Log it
        emit ProposalCancelled(_proposalID, msg.sender, now);
    }

        

}
