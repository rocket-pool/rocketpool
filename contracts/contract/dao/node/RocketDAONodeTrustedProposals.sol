pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "../../RocketBase.sol";
import "../../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import "../../../interface/dao/node/RocketDAONodeTrustedProposalsInterface.sol";
import "../../../interface/dao/node/RocketDAONodeTrustedActionsInterface.sol";
import "../../../interface/dao/node/RocketDAONodeTrustedSettingsInterface.sol";
import "../../../interface/dao/RocketDAOProposalInterface.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";


// The Trusted Node DAO Proposals 
contract RocketDAONodeTrustedProposals is RocketBase, RocketDAONodeTrustedProposalsInterface {  

    using SafeMath for uint;

    // Calculate using this as the base
    uint256 calcBase = 1 ether;

    // The namespace for any data stored in the trusted node DAO (do not change)
    string daoNameSpace = 'dao.trustednodes';

    // Possible states that a trusted node proposal may be in
    enum ProposalType {
        Invite,             // Invite a registered node to join the trusted node DAO
        Leave,              // Leave the DAO 
        Replace,            // Replace a current trusted node with a new registered node, they take over their bond
        Kick,               // Kick a member from the DAO with optional penalty applied to their RPL deposit
        Setting             // Change a DAO setting (Quorum threshold, RPL deposit size, voting periods etc)
    }


    // Only allow certain contracts to execute methods
    modifier onlyExecutingContracts() {
        // Methods are either executed by bootstrapping methods in rocketDAONodeTrusted or by people executing passed proposals in rocketDAOProposal
        require(msg.sender == getContractAddress("rocketDAONodeTrusted") || msg.sender == getContractAddress("rocketDAOProposal"), "Sender is not permitted to access executing methods");
        _;
    }

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }


        
    /*** Proposals **********************/

    // Create a DAO proposal with calldata, if successful will be added to a queue where it can be executed
    // A general message can be passed by the proposer along with the calldata payload that can be executed if the proposal passes
    function propose(string memory _proposalMessage, bytes memory _payload) override public onlyTrustedNode(msg.sender) onlyLatestContract("rocketDAONodeTrustedProposals", address(this)) returns (uint256) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress('rocketDAOProposal'));
        RocketDAONodeTrustedInterface daoNodeTrusted = RocketDAONodeTrustedInterface(getContractAddress('rocketDAONodeTrusted'));
        RocketDAONodeTrustedSettingsInterface rocketDAOSettings = RocketDAONodeTrustedSettingsInterface(getContractAddress("rocketDAONodeTrustedSettings"));
        // Check this user can make a proposal now
        require(daoNodeTrusted.getMemberLastProposalBlock(msg.sender).add(rocketDAOSettings.getProposalCooldown()) >= block.number, "Member has not waited long enough to make another proposal");
        // Record the last time this user made a proposal
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.proposal.lastblock", msg.sender)), block.number);
        // Create the proposal
        return daoProposal.add(msg.sender, 'rocketDAONodeTrustedProposals', _proposalMessage, block.number.add(rocketDAOSettings.getProposalVoteDelayBlocks()), rocketDAOSettings.getProposalVoteBlocks(), rocketDAOSettings.getProposalExecuteBlocks(), daoNodeTrusted.getMemberQuorumVotesRequired(), _payload);
    }

    // Vote on a proposal
    function vote(uint256 _proposalID, bool _support) override public onlyTrustedNode(msg.sender) onlyLatestContract("rocketDAONodeTrustedProposals", address(this)) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress('rocketDAOProposal'));      
        RocketDAONodeTrustedInterface daoNodeTrusted = RocketDAONodeTrustedInterface(getContractAddress('rocketDAONodeTrusted'));
        // Did they join after this proposal was created? If so, they can't vote or it'll throw off the set proposalVotesRequired 
        require(daoNodeTrusted.getMemberJoinedBlock(msg.sender) < daoProposal.getCreated(_proposalID), "Member cannot vote on proposal created before they became a member");
        // Vote now, one vote per trusted node member
        daoProposal.vote(msg.sender, 1 ether, _proposalID, _support);
    }
    
    // Cancel a proposal 
    function cancel(uint256 _proposalID) override public onlyTrustedNode(msg.sender) onlyLatestContract("rocketDAONodeTrustedProposals", address(this)) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress('rocketDAOProposal'));
        // Cancel now, will succeed if it is the original proposer
        daoProposal.cancel(msg.sender, _proposalID);
    }

    // Execute a proposal 
    function execute(uint256 _proposalID) override public onlyLatestContract("rocketDAONodeTrustedProposals", address(this)) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress('rocketDAOProposal'));
        // Execute now
        daoProposal.execute(_proposalID);
    }



    /*** Proposal Methods **********************/

    // A new DAO member being invited, can only be done via a proposal or in bootstrap mode
    // Provide an ID that indicates who is running the trusted node and the address of the registered node that they wish to propose joining the dao
    function proposalInvite(string memory _id, string memory _email, address _nodeAddress) override public onlyExecutingContracts onlyRegisteredNode(_nodeAddress) {
        // Their proposal executed, record the block
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.proposal.executed.block", "invited", _nodeAddress)), block.number);
        // Ok all good, lets get their invitation and member data setup
        // They are initially only invited to join, so their membership isn't set as true until they accept it in RocketDAONodeTrustedActions
        _memberInit(_id, _email, _nodeAddress);
    }


    // A current member proposes leaving the trusted node DAO, when successful they will be allowed to collect their RPL bond
    function proposalLeave(address _nodeAddress) override public onlyExecutingContracts onlyTrustedNode(_nodeAddress) { 
        // Load contracts
        RocketDAONodeTrustedInterface daoNodeTrusted = RocketDAONodeTrustedInterface(getContractAddress('rocketDAONodeTrusted'));
        // Check this wouldn't dip below the min required trusted nodes (also checked when the node has a successful proposal and attempts to exit)
        require(daoNodeTrusted.getMemberCount() > daoNodeTrusted.getMemberMinRequired(), "Member count will fall below min required, this member must choose to be replaced");
        // Their proposal to leave has been accepted, record the block
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.proposal.executed.block", "leave", _nodeAddress)), block.number);
    }


    // A current member proposes replacing themselves as a member with a new member who will take over their RPL bond
    // Member who is proposing to be replaced, must action the method in the actions contract to confirm they want to be replaced
    function proposalReplace(address _memberNodeAddress, string memory _replaceId, string memory _replaceEmail, address _replaceNodeAddress) override public onlyExecutingContracts onlyTrustedNode(_memberNodeAddress) onlyRegisteredNode(_replaceNodeAddress) { 
        // Their proposal to be replaced has been accepted, record the block
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.proposal.executed.block", "replace", _memberNodeAddress)), block.number);
        // Initialise the new prospective members details
        _memberInit(_replaceId, _replaceEmail, _replaceNodeAddress);
        // Their proposal to be replaced has been accepted
        setAddress(keccak256(abi.encodePacked(daoNameSpace, "member.replace", "new", _memberNodeAddress)), _replaceNodeAddress);
        setAddress(keccak256(abi.encodePacked(daoNameSpace, "member.replace", "current", _memberNodeAddress)), _memberNodeAddress);
    }
    

    // Propose to kick a current member from the DAO with an optional RPL bond fine
    function proposalKick(address _nodeAddress, uint256 _rplFine) override public onlyExecutingContracts onlyTrustedNode(_nodeAddress) { 
        // Load contracts
        RocketDAONodeTrustedInterface daoNodeTrusted = RocketDAONodeTrustedInterface(getContractAddress('rocketDAONodeTrusted'));
        RocketDAONodeTrustedActionsInterface daoActionsContract = RocketDAONodeTrustedActionsInterface(getContractAddress('rocketDAONodeTrustedActions'));
        // How much is their RPL bond?
        uint256 rplBondAmount = daoNodeTrusted.getMemberRPLBondAmount(_nodeAddress);
        // Check fine amount can be covered
        require(_rplFine <= rplBondAmount, "RPL Fine must be lower or equal to the RPL bond amount of the node being kicked");
        // Set their bond amount minus the fine
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.bond.rpl", _nodeAddress)), rplBondAmount.sub(_rplFine));
        // Kick them now
        daoActionsContract.actionKick(_nodeAddress);
    }


    // Change one of the current settings of the trusted node DAO
    // Settings only support Uints currently
    function proposalSetting(string memory _settingPath, uint256 _value) override public onlyExecutingContracts() {
        // Load contracts
        RocketDAONodeTrustedSettingsInterface rocketDAOSettings = RocketDAONodeTrustedSettingsInterface(getContractAddress("rocketDAONodeTrustedSettings"));
        // Some safety guards for certain settings
        if(keccak256(abi.encodePacked(_settingPath)) == keccak256(abi.encodePacked("quorum"))) require(_value >= 0.51 ether && _value <= 0.9 ether, "Quorum setting must be >= 51% and <= 90%");
        // Ok all good, lets update
        rocketDAOSettings.setSettingUint(_settingPath, _value);
    }


    // Add a new potential members data, they are not official members yet, just propsective
    function _memberInit(string memory _id, string memory _email, address _nodeAddress) private onlyRegisteredNode(_nodeAddress) {
        // Load contracts
        RocketDAONodeTrustedInterface daoNodeTrusted = RocketDAONodeTrustedInterface(getContractAddress('rocketDAONodeTrusted'));
        // Check current node status
        require(!daoNodeTrusted.getMemberIsValid(_nodeAddress), "This node is already part of the trusted node DAO");
        // Verify the ID is min 3 chars
        require(bytes(_id).length >= 3, "The ID for this new member must be at least 3 characters");
        // Check email address length
        require(bytes(_email).length >= 6, "The email for this new member must be at least 6 characters");
        // Member initial data, not official until the bool is flagged as true
        setBool(keccak256(abi.encodePacked(daoNameSpace, "member", _nodeAddress)), false);
        setAddress(keccak256(abi.encodePacked(daoNameSpace, "member.address", _nodeAddress)), _nodeAddress);
        setString(keccak256(abi.encodePacked(daoNameSpace, "member.id", _nodeAddress)), _id);
        setString(keccak256(abi.encodePacked(daoNameSpace, "member.email", _nodeAddress)), _email);
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.bond.rpl", _nodeAddress)), 0);
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.joined.block", _nodeAddress)), 0);
    }
        

}
