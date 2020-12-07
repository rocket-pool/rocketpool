pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/node/RocketNodeTrustedDAOInterface.sol";
import "../../interface/rewards/claims/RocketClaimTrustedNodeInterface.sol";
import "../../interface/util/AddressSetStorageInterface.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";


// The Trusted Node DAO
contract RocketNodeTrustedDAO is RocketBase, RocketNodeTrustedDAOInterface {

    using SafeMath for uint;

    // Events
    event ProposalAdded(address indexed proposer, uint256 indexed proposalID, uint256 indexed proposalType, bytes payload, uint256 time);  
    event ProposalVoted(uint256 indexed proposalID, address indexed voter, bool indexed supported, uint256 time);  
    event ProposalExecuted(uint256 indexed proposalID, address indexed executer, uint256 time);
    event ProposalCancelled(uint256 indexed proposalID, address indexed canceller, uint256 time);    

    // Calculate using this as the base
    uint256 calcBase = 1 ether;

    // The namespace for any data stored in the trusted node DAO (do not change)
    string daoNameSpace = 'dao.trustednodes';

    // Possible states that a proposal may be in
    enum ProposalType {
        Invite,             // Invite a registered node to join the trusted node DAO
        Leave,              // Leave the DAO 
        Replace,            // Replace a current trusted node with a new registered node
        Kick,               // Kick a member from the DAO with optional penalty applied to their RPL deposit
        Setting             // Change a DAO setting (Quorum, RPL deposit sie, voting periods etc)
        //Quorum              // Set the quorum required to pass a proposal ( min: 51%, max 90% )
    }

    // Possible states that a proposal may be in
    enum ProposalState {
        Active,
        Cancelled,
        Defeated,
        Succeeded,
        Expired,
        Executed
    }


    // Only allow bootstrapping the dao if it has less than the required members to form the DAO
    modifier onlyBootstrapMode() {
        require(getMemberCount() < memberMinCount, "Bootstrap mode not engaged, min DAO member count has been met");
        _;
    }


    // Min amount of trusted node members required in the DAO
    uint256 memberMinCount = 3;
    // The amount of blocks a member must wait between making proposals
    uint256 memberProposalCooldownBlocks = 13221;           // Approx. 2 days worth of blocks

    // The voting period for a proposal to pass
    uint256 proposalVotingBlocks = 92550;                   // Approx. 2 weeks worth of blocks
    // The time for a successful proposal to be executed, 
    // Will need to be resubmitted if this deadline passes
    uint256 proposalVotingExecuteBlocks = 185100;           // Approx. 4 weeks worth of blocks

    // TODO: Add in min time before they can add a proposal eg: 1 month

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
        // Set some initial settings
        setUint(keccak256(abi.encodePacked(daoNameSpace, "setting", "quorum")), 0.51 ether);
    }


    /*** Settings  ****************/
    
    // Return the current % the DAO is using for a quorum
    function getSettingQuorumThreshold() override public view returns (uint256) {
        // Specified as % of 1 ether
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "setting", "quorum")));
    } 

    // Return the current RPL bond size required to join
    function getSettingRPLBondSize() override public view returns (uint256) {
        // Specified as % of 1 ether
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "setting", "rplbond")));
    } 



    /*** Members ******************/

    
    // Get a trusted node member address by index
    function getMemberAt(uint256 _index) override public view returns (address) { 
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getItem(keccak256(abi.encodePacked(daoNameSpace, "member.index")), _index);
    }

    // Total number of members in the current trusted node DAO
    function getMemberCount() override public view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getCount(keccak256(abi.encodePacked(daoNameSpace, "member.index")));
    }

    // Return the min number of members required for the DAO
    function getMemberCountMinRequired() override public view returns (uint256) { 
        return memberMinCount; 
    }

    // Return true if the node addressed passed is a member of the trusted node DAO
    function getMemberIsValid(address _nodeAddress) override public view returns (bool) { 
        return getBool(keccak256(abi.encodePacked("dao.trustednodes", "member", _nodeAddress))); 
    }

    // Return true if the member can post another proposal after their last one due to the cooldown
    function getMemberCanMakeProposal(address _nodeAddress) override public view returns (bool) { 
        return getMemberIsValid(_nodeAddress) && getUint(keccak256(abi.encodePacked(daoNameSpace, "member.proposal.last", _nodeAddress))).add(memberProposalCooldownBlocks) < block.number ? true : false; 
    }



    /*** Proposals ****************/
    
    // Get the current total for this type of proposal
    function getProposalTotal() override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "proposals.total"))); 
    }

    // Get the member who proposed
    function getProposalProposer(uint256 _proposalID) override public view returns (address) {
        return getAddress(keccak256(abi.encodePacked(daoNameSpace, "proposal.proposer", _proposalID))); 
    }

    // Get the expired status of this proposal
    function getProposalExpires(uint256 _proposalID) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.expires", _proposalID))); 
    }

    // Get the created status of this proposal
    function getProposalCreated(uint256 _proposalID) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.created", _proposalID))); 
    }

    // Get the votes for count of this proposal
    function getProposalVotesFor(uint256 _proposalID) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.votes.for", _proposalID))); 
    }

    // Get the votes against count of this proposal
    function getProposalVotesAgainst(uint256 _proposalID) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.votes.against", _proposalID))); 
    }

    // Get the cancelled status of this proposal
    function getProposalCancelled(uint256 _proposalID) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked(daoNameSpace, "proposal.cancelled", _proposalID))); 
    }

    // Get the executed status of this proposal
    function getProposalExecuted(uint256 _proposalID) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked(daoNameSpace, "proposal.executed", _proposalID))); 
    }

    // A successful proposal needs to be execute before it expires (set amount of blocks), if it expires the proposal needs to be resubmitted
    function getProposalExecutedExpired(uint256 _proposalID) override public view returns (bool) {
        return getProposalExpires(_proposalID).add(proposalVotingExecuteBlocks) < block.number ? true : false; 
    }

    // Get the votes against count of this proposal
    function getProposalPayload(uint256 _proposalID) override public view returns (bytes memory) {
        return getBytes(keccak256(abi.encodePacked(daoNameSpace, "proposal.payload", _proposalID))); 
    }

    // Returns true if this proposal has already been voted on by a member
    function getProposalReceiptHasVoted(uint256 _proposalID, address _nodeAddress) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked(daoNameSpace, "proposal.receipt.hasVoted", _proposalID, _nodeAddress))); 
    }

    // Returns true if this proposal was supported by this member
    function getProposalReceiptSupported(uint256 _proposalID, address _nodeAddress) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked(daoNameSpace, "proposal.receipt.supported", _proposalID, _nodeAddress))); 
    }
    
    // Return the amount of votes need for a proposal to pass
    function getProposalQuorumVotesRequired() override public view returns (uint256) {
        // Get the total trusted nodes
        uint256 trustedNodeCount = getMemberCount();
        // Get the total members to use when calculating
        uint256 total = trustedNodeCount > 0 ? calcBase.div(trustedNodeCount) : 0;
        // Return the votes required
        return calcBase.mul(getSettingQuorumThreshold()).div(total);
    }

    // Return the state of the specified proposal
    function getProposalState(uint256 _proposalID) public view returns (ProposalState) {
        // Check the proposal ID is legit
        require(getProposalTotal() >= _proposalID && _proposalID > 0, "Invalid proposal ID");
        // Get the amount of votes for and against
        uint256 votesFor = getProposalVotesFor(_proposalID);
        uint256 votesAgainst = getProposalVotesAgainst(_proposalID);
        // Now return the state of the current proposal
        if (getProposalCancelled(_proposalID)) {
            // Cancelled by the proposer?
            return ProposalState.Cancelled;
            // Has it been executed?
        } else if (getProposalExecuted(_proposalID)) {
            return ProposalState.Executed;
            // Check the votes, was it defeated?
        } else if (votesFor <= votesAgainst || votesFor < getProposalQuorumVotesRequired()) {
            return ProposalState.Defeated;
            // Check the votes, did it pass?
        } else if (votesFor >= getProposalQuorumVotesRequired()) {
            return ProposalState.Succeeded;
            // Has it expired?
        } else if (getProposalExpires(_proposalID) < block.number) {
            return ProposalState.Expired;
        } else {
            // Proposal is active
            return ProposalState.Active;
        }
    }


    // Add a proposal to the trusted node DAO, immeditately becomes active
    // Calldata is passed as the payload to execute upon passing the proposal
    // TODO: Add required checks
    function proposalAdd(uint256 _proposalType, bytes memory _payload) override public onlyTrustedNode(msg.sender) returns (bool) {
        // Check this user can make a proposal now
        require(getMemberCanMakeProposal(msg.sender), "Member cannot make a proposal or has not waited long enough to make another proposal");
        // Save the last time they made a proposal
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.proposal.last", msg.sender)), block.number);
        // Get the total proposal count for this type
        uint256 proposalCount = getProposalTotal(); 
        // Get the proposal ID
        uint256 proposalID = proposalCount.add(1);
        // The data structure for a proposal
        setUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.type", proposalID)), _proposalType);
        setAddress(keccak256(abi.encodePacked(daoNameSpace, "proposal.proposer", proposalID)), msg.sender);
        setUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.expires", proposalID)), block.number.add(proposalVotingBlocks));
        setUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.created", proposalID)), block.number);
        setUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.votes.for", proposalID)), 0);
        setUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.votes.against", proposalID)), 0);
        setBool(keccak256(abi.encodePacked(daoNameSpace, "proposal.cancelled", proposalID)), false);
        setBool(keccak256(abi.encodePacked(daoNameSpace, "proposal.executed", proposalID)), false);
        setBytes(keccak256(abi.encodePacked(daoNameSpace, "proposal.payload", proposalID)), _payload);
        // Update the total proposals
        setUint(keccak256(abi.encodePacked(daoNameSpace, "proposals.total")), proposalID);
        // Log it
        emit ProposalAdded(msg.sender, proposalID, _proposalType, _payload, now);
    }


    // Voting for or against a proposal
    function proposalVote(uint256 _proposalID, bool _support) override public onlyTrustedNode(msg.sender) {
        // Check the proposal is in a state that can be voted on
        require(getProposalState(_proposalID) == ProposalState.Active, "Voting is closed for this proposal");
        // Has this member already voted on this proposal?
        require(!getProposalReceiptHasVoted(_proposalID, msg.sender), "Member has already voted on proposal");
        // Add votes to proposal
        if(_support) {
            setUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.votes.for", _proposalID)), getProposalVotesFor(_proposalID).add(1));
        }else{
            setUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.votes.against", _proposalID)), getProposalVotesAgainst(_proposalID).add(1));
        }
        // Record the vote receipt now
        setBool(keccak256(abi.encodePacked(daoNameSpace, "proposal.receipt.hasVoted", _proposalID, msg.sender)), true);
        setBool(keccak256(abi.encodePacked(daoNameSpace, "proposal.receipt.supported", _proposalID, msg.sender)), _support);
        // Log it
        emit ProposalVoted(_proposalID, msg.sender, _support, now);
    }
    

    // Execute a proposal if it has passed
    // Anyone can run this if they are willing to pay the gas costs for it
    // A proposal can be executed as soon as it hits a majority in favour
    // The original proposer must still be a member for it to be executed
    function proposalExecute(uint256 _proposalID) onlyTrustedNode(getProposalProposer(_proposalID)) override public {
        // Firstly make sure this proposal has passed
        require(getProposalState(_proposalID) == ProposalState.Succeeded, "Proposal has not succeeded or has already been executed");
        // Check that the time period to execute hasn't expired (1 month to execute by default after voting period)
        require(!getProposalExecutedExpired(_proposalID), "Time to execute successful proposal has expired, please resubmit proposal for voting");
        // Set as executed now before running payload
        setBool(keccak256(abi.encodePacked(daoNameSpace, "proposal.executed", _proposalID)), true);
        // Ok all good, lets run the payload, it should execute one of the methods on this contract
        (bool success,) = address(this).call(getProposalPayload(_proposalID));
        // Verify it was successful
        require(success, "Payload call was not successful");
        // Log it
        emit ProposalExecuted(_proposalID, msg.sender, now);
    }


    // Cancel a proposal, can be cancelled by the original proposer only if it hasn't been executed yet
    function proposalCancel(uint256 _proposalID) override public {
        // Firstly make sure this proposal that hasn't already been executed
        require(getProposalState(_proposalID) != ProposalState.Executed, "Proposal has not succeeded or has already been executed");
        // Only allow the proposer to cancel
        require(getProposalProposer(_proposalID) == msg.sender, "Proposal can only be cancelled by the proposer");
        // Set as cancelled now
        setBool(keccak256(abi.encodePacked(daoNameSpace, "proposal.cancelled", _proposalID)), true);
        // Log it
        emit ProposalCancelled(_proposalID, msg.sender, now);
    }


    /**** Bootstrapping ***************/

    
    // Bootstrap mode - If there are less than the required min amount of node members, the owner can add some to bootstrap the DAO
    function bootstrapMember(string memory _id, string memory _email, string memory _message, address _nodeAddress) override public onlyOwner onlyBootstrapMode onlyRegisteredNode(_nodeAddress) {
        // Ok good to go, lets add them
        invite(_id, _email, _message, _nodeAddress); 
    }
    // Bootstrap mode - Set some initial settings for the DAO
    function bootstrapSetting(string memory _settingPath, uint256 _value) override public onlyOwner onlyBootstrapMode {
        // Ok good to go, lets update the settings
        setting(_settingPath, _value);
    }

    
    /*** Methods **********************/

    // All methods have a public interface so that the calldata payload can be executed, but it must only be run by this contract in `proposalExecute()`

    // A current DAO member wishes to invite a registered node to join the DAO
    // Provide an ID that indicates who is running the trusted node, an optional general message and the address of the registered node that they wish to propose joining the dao
    function invite(string memory _id, string memory _email, string memory _message, address _nodeAddress) override public onlyLatestContract("rocketNodeTrustedDAO", address(this)) onlyRegisteredNode(_nodeAddress) returns (bool) {
        // Load contracts
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Check current node status
        require(getBool(keccak256(abi.encodePacked(daoNameSpace, "member", _nodeAddress))) != true, "This node is already part of the trusted node DAO");
        // Verify the ID is min 3 chars
        require(bytes(_id).length >= 3, "The ID for this new member must be at least 3 characters");
        // Check email address length
        require(bytes(_email).length >= 6, "The email for this new member must be at least 6 characters");
        // Ok all good, lets get them setup
        setBool(keccak256(abi.encodePacked(daoNameSpace, "member", _nodeAddress)), true);
        setAddress(keccak256(abi.encodePacked(daoNameSpace, "member.address", _nodeAddress)), _nodeAddress);
        setString(keccak256(abi.encodePacked(daoNameSpace, "member.id", _nodeAddress)), _id);
        setString(keccak256(abi.encodePacked(daoNameSpace, "member.email", _nodeAddress)), _email);
        setString(keccak256(abi.encodePacked(daoNameSpace, "member.message", _nodeAddress)), _message);
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.joined", _nodeAddress)), block.number);
        // Add to index
        addressSetStorage.addItem(keccak256(abi.encodePacked(daoNameSpace, "member.index")), _nodeAddress); 
        // Register for them to receive rewards now
        _rewardsEnable(_nodeAddress, true);
        // Done
        return true;
    }

    // Change one of the current settings of the trusted node DAO
    // Settings only support Uints currently
    function setting(string memory _settingPath, uint256 _value) override public onlyLatestContract("rocketNodeTrustedDAO", address(this)) returns (bool) {
        // Some safety guards for certain settings
        if(keccak256(abi.encodePacked(_settingPath)) == keccak256(abi.encodePacked("quorum"))) require(_value >= 0.51 ether && _value <= 0.9 ether, "Quorum setting must be >= 51% and <= 90%");
        // Ok all good, lets update
        setUint(keccak256(abi.encodePacked(daoNameSpace, "setting", _settingPath)), _value);
    }



    /*** RPL Rewards ***********/

 
    // Enable trusted nodes to call this themselves in case the rewards contract for them was disabled for any reason when they were set as trusted
    function rewardsRegister(bool _enable) override public onlyTrustedNode(msg.sender) {
        _rewardsEnable(msg.sender, _enable);
    }


    // Enable a trusted node to register for receiving RPL rewards
    // Must be added when they join and removed when they leave
    function _rewardsEnable(address _nodeAddress, bool _enable) private onlyTrustedNode(_nodeAddress) {
        // Load contracts
        RocketClaimTrustedNodeInterface rewardsClaimTrustedNode = RocketClaimTrustedNodeInterface(getContractAddress("rocketClaimTrustedNode"));
        // Verify the trust nodes rewards contract is enabled 
        if(rewardsClaimTrustedNode.getEnabled()) {
            if(_enable) {
                // Register
                rewardsClaimTrustedNode.register(_nodeAddress, true); 
            }else{
                // Unregister
                rewardsClaimTrustedNode.register(_nodeAddress, false); 
            }
        }
    }
        

}
