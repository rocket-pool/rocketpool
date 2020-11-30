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
    //event RPLTokensSentDAO(address indexed from, address indexed to, uint256 amount, uint256 time);  

    // Calculate using this as the base
    uint256 calcBase = 1 ether;

    // The namespace for any data stored in the trusted node DAO (do not change)
    string daoNameSpace = 'dao.trustednodes.';

    // Possible states that a proposal may be in
    enum ProposalType {
        Join,               // Join the DAO
        Leave,              // Leave the DAO 
        Replace,            // Replace a current trusted node with a new registered node
        Kick,               // Kick a member from the DAO with optional penalty applied to their RPL deposit
        Bond,               // The RPL bond amount required to join as a trusted node dao member,
        Quorum              // Set the quorum required to pass a proposal ( min: 51%, max 90% )
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

    // Max number of active proposals allowed at any given time per type
    uint256 maxActiveTypeProposals = 50;

    // Max number of active proposals allowed per trusted node
    uint256 maxActiveProposalsPerMember = 2;

    // Min amount of trusted nodes required in the DAO
    uint256 minMemberCount = 3;

    // Timeout in blocks for a proposal to expire
    uint256 expireEndBlocks = 185100;      // Approx. 1 months worth of blocks

    // TODO: Add in min time before they can add a proposal eg: 1 month

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
        // Set the quorum - specified as % of 1 ether
        setUint(keccak256(abi.encodePacked(daoNameSpace, "setting.quorum")), 0.51 ether);
    }


    /*** Settings  ****************/
    
    // Return the current % the DAO is using for a quorum
    function getSettingQuorum() override public view returns (uint256) {
        // Specified as % of 1 ether
        getUint(keccak256(abi.encodePacked(daoNameSpace, "setting.quorum")));
    } 


    /*** Members ******************/

    function getTrustedNodeCount() override public view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getCount(keccak256(abi.encodePacked("nodes.trusted.index")));
    }


    /*** Proposals ****************/
    
    // Get the current total for this type of proposal
    function getProposalTotal() override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "proposals.total"))); 
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

    // Get the votes against count of this proposal
    function getProposalPayload(uint256 _proposalID) override public view returns (bytes memory) {
        return getBytes(keccak256(abi.encodePacked(daoNameSpace, "proposal.payload", _proposalID))); 
    }
    
    // Return the amount of votes need for a proposal to pass
    function getProposalQuorumVotesRequired() override public view returns (uint256) {
        // Get the total trusted nodes
        uint256 trustedNodeCount = getTrustedNodeCount();
        // Get the total members to use when calculating
        uint256 total = trustedNodeCount >= minMemberCount ? calcBase.div(trustedNodeCount) : minMemberCount;
        // Return the votes required
        return calcBase.mul(getSettingQuorum()).div(trustedNodeCount);
    }

    // Add a proposal to the trusted node DAO, immeditately becomes active
    // Calldata is passed as the payload to execute upon passing the proposal
    // TODO: Add required checks
    function proposalAdd(uint256 _proposalType, bytes memory _payload) override public onlyTrustedNode(msg.sender) returns (bool) {
        // Get the total proposal count for this type
        uint256 proposalCount = getProposalTotal();
        // Get the proposal ID
        uint256 proposalID = proposalCount.add(1);
        // The data structure for a proposal
        setUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.id")), proposalID);
        setUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.type")), _proposalType);
        setAddress(keccak256(abi.encodePacked(daoNameSpace, "proposal.proposer", _proposalType)), msg.sender);
        setUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.end")), block.number.add(expireEndBlocks));
        setUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.created")), block.number);
        setUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.votes.for")), 0);
        setUint(keccak256(abi.encodePacked(daoNameSpace, "proposal.votes.against")), 0);
        setBool(keccak256(abi.encodePacked(daoNameSpace, "proposal.cancelled")), false);
        setBool(keccak256(abi.encodePacked(daoNameSpace, "proposal.executed")), false);
        setBytes(keccak256(abi.encodePacked(daoNameSpace, "proposal.payload")), _payload);
        // Update the total proposals
        setUint(keccak256(abi.encodePacked(daoNameSpace, "proposals.total")), proposalID);
    }

    
    // Return the state of the specified proposal
    function proposalState(uint256 _proposalID) public view returns (ProposalState) {
        // Check the proposal ID is legit
        require(getProposalTotal() >= _proposalID && _proposalID > 0, "Invalid proposal ID");
        // Get the amount of votes for and against
        uint256 votesFor = getProposalVotesFor(_proposalID);
        uint256 votesAgainst = getProposalVotesAgainst(_proposalID);
        // Now return the state of the current proposal
        if (getProposalCancelled(_proposalID)) {
            // Cancelled by the proposer?
            return ProposalState.Cancelled;
            // Is the proposal is still active?
        } else if (block.number <= getProposalExpires(_proposalID)) {
            return ProposalState.Active;
            // Has it been executed?
        } else if (getProposalExecuted(_proposalID)) {
            return ProposalState.Executed;
            // Check the votes, was it defeated?
        } else if (votesFor <= votesAgainst || votesFor < getProposalQuorumVotesRequired()) {
            return ProposalState.Defeated;
            // Check the votes, did it pass?
        } else if (votesFor >= getProposalQuorumVotesRequired()) {
            return ProposalState.Succeeded;
        } 
    }


    /*** Methods **********************/

    // A registered RP node wishes to join the trusted node DAO
    // Provide an ID that indicates who is running the trusted node, a general message and the address of the registered node that they wish to propose joining the dao
    function join(string memory _id, string memory _message, address _nodeAddress) override public onlyTrustedNode(msg.sender) onlyRegisteredNode(_nodeAddress) returns (bool) {
        // Check current node status
        require(getBool(keccak256(abi.encodePacked("node.trusted", _nodeAddress))) != true, "This node is already part of the trusted node DAO");
        // Check address 
    }



    /*** RPL Rewards ***********/

 
    // Enable trusted nodes to call this themselves in case the rewards contract for them was disabled for any reason when they were set as trusted
    function rewardsRegister(bool _enable) override public onlyTrustedNode(msg.sender) {
        rewardsEnable(msg.sender, _enable);
    }


    // Enable a trusted node to register for receiving RPL rewards
    // Must be added when they join and removed when they leave
    function rewardsEnable(address _nodeAddress, bool _enable) private onlyTrustedNode(_nodeAddress) {
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
