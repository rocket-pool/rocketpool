pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../../RocketBase.sol";
import "../../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import "../../../interface/dao/node/RocketDAONodeTrustedProposalsInterface.sol";
import "../../../interface/dao/node/RocketDAONodeTrustedActionsInterface.sol";
import "../../../interface/dao/node/RocketDAONodeTrustedUpgradeInterface.sol";
import "../../../interface/dao/node/settings/RocketDAONodeTrustedSettingsInterface.sol";
import "../../../interface/dao/node/settings/RocketDAONodeTrustedSettingsProposalsInterface.sol";
import "../../../interface/dao/RocketDAOProposalInterface.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";


// The Trusted Node DAO Proposals 
contract RocketDAONodeTrustedProposals is RocketBase, RocketDAONodeTrustedProposalsInterface {  

    using SafeMath for uint;

    // The namespace for any data stored in the trusted node DAO (do not change)
    string constant daoNameSpace = "dao.trustednodes.";

    // Only allow certain contracts to execute methods
    modifier onlyExecutingContracts() {
        // Methods are either executed by bootstrapping methods in rocketDAONodeTrusted or by people executing passed proposals in rocketDAOProposal
        require(msg.sender == getContractAddress("rocketDAONodeTrusted") || msg.sender == getContractAddress("rocketDAOProposal"), "Sender is not permitted to access executing methods");
        _;
    }

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        // Version
        version = 1;
    }

        
    /*** Proposals **********************/

    // Create a DAO proposal with calldata, if successful will be added to a queue where it can be executed
    // A general message can be passed by the proposer along with the calldata payload that can be executed if the proposal passes
    function propose(string memory _proposalMessage, bytes memory _payload) override external onlyTrustedNode(msg.sender) onlyLatestContract("rocketDAONodeTrustedProposals", address(this)) returns (uint256) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress("rocketDAOProposal"));
        RocketDAONodeTrustedInterface daoNodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        RocketDAONodeTrustedSettingsProposalsInterface rocketDAONodeTrustedSettingsProposals = RocketDAONodeTrustedSettingsProposalsInterface(getContractAddress("rocketDAONodeTrustedSettingsProposals"));
        // Check this user can make a proposal now
        require(daoNodeTrusted.getMemberLastProposalTime(msg.sender).add(rocketDAONodeTrustedSettingsProposals.getCooldownTime()) <= block.timestamp, "Member has not waited long enough to make another proposal");
        // Require the min amount of members are in to make a proposal
        require(daoNodeTrusted.getMemberCount() >= daoNodeTrusted.getMemberMinRequired(), "Min member count not met to allow proposals to be added");
        // Record the last time this user made a proposal
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.proposal.lasttime", msg.sender)), block.timestamp);
        // Create the proposal
        return daoProposal.add(msg.sender, "rocketDAONodeTrustedProposals", _proposalMessage, block.timestamp.add(rocketDAONodeTrustedSettingsProposals.getVoteDelayTime()), rocketDAONodeTrustedSettingsProposals.getVoteTime(), rocketDAONodeTrustedSettingsProposals.getExecuteTime(), daoNodeTrusted.getMemberQuorumVotesRequired(), _payload);
    }

    // Vote on a proposal
    function vote(uint256 _proposalID, bool _support) override external onlyTrustedNode(msg.sender) onlyLatestContract("rocketDAONodeTrustedProposals", address(this)) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress("rocketDAOProposal"));
        RocketDAONodeTrustedInterface daoNodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        // Did they join after this proposal was created? If so, they can't vote or it'll throw off the set proposalVotesRequired 
        require(daoNodeTrusted.getMemberJoinedTime(msg.sender) < daoProposal.getCreated(_proposalID), "Member cannot vote on proposal created before they became a member");
        // Vote now, one vote per trusted node member
        daoProposal.vote(msg.sender, 1 ether, _proposalID, _support);
    }
    
    // Cancel a proposal 
    function cancel(uint256 _proposalID) override external onlyTrustedNode(msg.sender) onlyLatestContract("rocketDAONodeTrustedProposals", address(this)) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress("rocketDAOProposal"));
        // Cancel now, will succeed if it is the original proposer
        daoProposal.cancel(msg.sender, _proposalID);
    }

    // Execute a proposal 
    function execute(uint256 _proposalID) override external onlyLatestContract("rocketDAONodeTrustedProposals", address(this)) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress("rocketDAOProposal"));
        // Execute now
        daoProposal.execute(_proposalID);
    }



    /*** Proposal - Members **********************/

    // A new DAO member being invited, can only be done via a proposal or in bootstrap mode
    // Provide an ID that indicates who is running the trusted node and the address of the registered node that they wish to propose joining the dao
    function proposalInvite(string memory _id, string memory _url, address _nodeAddress) override external onlyExecutingContracts onlyRegisteredNode(_nodeAddress) {
        // Their proposal executed, record the block
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.executed.time", "invited", _nodeAddress)), block.timestamp);
        // Ok all good, lets get their invitation and member data setup
        // They are initially only invited to join, so their membership isn't set as true until they accept it in RocketDAONodeTrustedActions
        _memberInit(_id, _url, _nodeAddress);
    }


    // A current member proposes leaving the trusted node DAO, when successful they will be allowed to collect their RPL bond
    function proposalLeave(address _nodeAddress) override external onlyExecutingContracts onlyTrustedNode(_nodeAddress) {
        // Load contracts
        RocketDAONodeTrustedInterface daoNodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        // Check this wouldn't dip below the min required trusted nodes (also checked when the node has a successful proposal and attempts to exit)
        require(daoNodeTrusted.getMemberCount() > daoNodeTrusted.getMemberMinRequired(), "Member count will fall below min required");
        // Their proposal to leave has been accepted, record the block
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.executed.time", "leave", _nodeAddress)), block.timestamp);
    }


    // Propose to kick a current member from the DAO with an optional RPL bond fine
    function proposalKick(address _nodeAddress, uint256 _rplFine) override external onlyExecutingContracts onlyTrustedNode(_nodeAddress) {
        // Load contracts
        RocketDAONodeTrustedInterface daoNodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        RocketDAONodeTrustedActionsInterface daoActionsContract = RocketDAONodeTrustedActionsInterface(getContractAddress("rocketDAONodeTrustedActions"));
        // How much is their RPL bond?
        uint256 rplBondAmount = daoNodeTrusted.getMemberRPLBondAmount(_nodeAddress);
        // Check fine amount can be covered
        require(_rplFine <= rplBondAmount, "RPL Fine must be lower or equal to the RPL bond amount of the node being kicked");
        // Set their bond amount minus the fine
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.bond.rpl", _nodeAddress)), rplBondAmount.sub(_rplFine));
        // Kick them now
        daoActionsContract.actionKick(_nodeAddress, _rplFine);
    }


    /*** Proposal - Settings ***************/

    // Change one of the current uint256 settings of the DAO
    function proposalSettingUint(string memory _settingContractName, string memory _settingPath, uint256 _value) override external onlyExecutingContracts() {
        // Load contracts
        RocketDAONodeTrustedSettingsInterface rocketDAONodeTrustedSettings = RocketDAONodeTrustedSettingsInterface(getContractAddress(_settingContractName));
        // Lets update
        rocketDAONodeTrustedSettings.setSettingUint(_settingPath, _value);
    }

    // Change one of the current bool settings of the DAO
    function proposalSettingBool(string memory _settingContractName, string memory _settingPath, bool _value) override external onlyExecutingContracts() {
        // Load contracts
        RocketDAONodeTrustedSettingsInterface rocketDAONodeTrustedSettings = RocketDAONodeTrustedSettingsInterface(getContractAddress(_settingContractName));
        // Lets update
        rocketDAONodeTrustedSettings.setSettingBool(_settingPath, _value);
    }


    /*** Proposal - Upgrades ***************/

    // Upgrade contracts or ABI's if the DAO agrees
    function proposalUpgrade(string memory _type, string memory _name, string memory _contractAbi, address _contractAddress) override external onlyExecutingContracts() {
        // Load contracts
        RocketDAONodeTrustedUpgradeInterface rocketDAONodeTrustedUpgradeInterface = RocketDAONodeTrustedUpgradeInterface(getContractAddress("rocketDAONodeTrustedUpgrade"));
        // Lets update
        rocketDAONodeTrustedUpgradeInterface.upgrade(_type, _name, _contractAbi, _contractAddress);
    }


    /*** Internal ***************/

    // Add a new potential members data, they are not official members yet, just propsective
    function _memberInit(string memory _id, string memory _url, address _nodeAddress) private onlyRegisteredNode(_nodeAddress) {
        // Load contracts
        RocketDAONodeTrustedInterface daoNodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        // Check current node status
        require(!daoNodeTrusted.getMemberIsValid(_nodeAddress), "This node is already part of the trusted node DAO");
        // Verify the ID is min 3 chars
        require(bytes(_id).length >= 3, "The ID for this new member must be at least 3 characters");
        // Check URL length
        require(bytes(_url).length >= 6, "The URL for this new member must be at least 6 characters");
        // Member initial data, not official until the bool is flagged as true
        setBool(keccak256(abi.encodePacked(daoNameSpace, "member", _nodeAddress)), false);
        setAddress(keccak256(abi.encodePacked(daoNameSpace, "member.address", _nodeAddress)), _nodeAddress);
        setString(keccak256(abi.encodePacked(daoNameSpace, "member.id", _nodeAddress)), _id);
        setString(keccak256(abi.encodePacked(daoNameSpace, "member.url", _nodeAddress)), _url);
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.bond.rpl", _nodeAddress)), 0);
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.joined.time", _nodeAddress)), 0);
    }
        

}
