// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketBase} from "../../RocketBase.sol";
import {RocketStorageInterface} from "../../../interface/RocketStorageInterface.sol";
import {RocketVaultInterface} from "../../../interface/RocketVaultInterface.sol";
import {RocketDAOProposalInterface} from "../../../interface/dao/RocketDAOProposalInterface.sol";
import {RocketDAOProtocolInterface} from "../../../interface/dao/protocol/RocketDAOProtocolInterface.sol";
import {RocketDAOProtocolSettingsSecurityInterface} from "../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsSecurityInterface.sol";
import {RocketDAOProtocolSettingsNetworkInterface} from "../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";
import {RocketDAOSecurityActionsInterface} from "../../../interface/dao/security/RocketDAOSecurityActionsInterface.sol";
import {RocketDAOSecurityInterface} from "../../../interface/dao/security/RocketDAOSecurityInterface.sol";
import {RocketDAOSecurityProposalsInterface} from "../../../interface/dao/security/RocketDAOSecurityProposalsInterface.sol";
import {RocketNetworkRevenuesInterface} from "../../../interface/network/RocketNetworkRevenuesInterface.sol";
import {IERC20Burnable} from "../../../interface/util/IERC20Burnable.sol";

/// @notice Proposal contract for the security council
contract RocketDAOSecurityProposals is RocketBase, RocketDAOSecurityProposalsInterface {

    // The namespace for any data stored in the trusted node DAO (do not change)
    string constant internal daoNameSpace = "dao.security.";

    // The namespace of the DAO that setting changes get applied to (protocol DAO)
    string constant internal protocolDaoSettingNamespace = "dao.protocol.setting.";

    /// @dev Only allow certain contracts to execute methods
    modifier onlyExecutingContracts() {
        // Methods are either executed by bootstrapping methods in rocketDAONodeTrusted or by people executing passed proposals in rocketDAOProposal
        require(msg.sender == getContractAddress("rocketDAOProtocol") || msg.sender == getContractAddress("rocketDAOProposal"), "Sender is not permitted to access executing methods");
        _;
    }

    /// @dev Only allow security councils to vote
    modifier onlySecurityMember() {
        require(getBool(keccak256(abi.encodePacked(daoNameSpace, "member", msg.sender))), "Sender is not a security council member");
        _;
    }

    /// @dev Reverts if the provided setting is not within the accepted set of settings
    modifier onlyValidSetting(string memory _settingNameSpace, string memory _settingPath) {
        if (!getBool(keccak256(abi.encodePacked("dao.security.allowed.setting", _settingNameSpace, _settingPath)))) {
            revert("Setting is not modifiable by security council");
        }
        _;
    }

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 2;
    }

    /// @notice Creates a new proposal for this DAO
    /// @param _proposalMessage A short message explaining what this proposal does
    /// @param _payload An ABI encoded payload which is executed on the proposal contract upon execution of this proposal
    function propose(string memory _proposalMessage, bytes memory _payload) override external onlySecurityMember() onlyLatestContract("rocketDAOSecurityProposals", address(this)) returns (uint256) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress("rocketDAOProposal"));
        RocketDAOSecurityInterface daoSecurity = RocketDAOSecurityInterface(getContractAddress("rocketDAOSecurity"));
        RocketDAOProtocolSettingsSecurityInterface rocketDAOProtocolSettingsSecurity = RocketDAOProtocolSettingsSecurityInterface(getContractAddress("rocketDAOProtocolSettingsSecurity"));
        // Create the proposal
        return daoProposal.add(msg.sender, "rocketDAOSecurityProposals", _proposalMessage, block.timestamp + 1, rocketDAOProtocolSettingsSecurity.getVoteTime(), rocketDAOProtocolSettingsSecurity.getExecuteTime(), daoSecurity.getMemberQuorumVotesRequired(), _payload);
    }

    /// @notice Vote on a proposal
    /// @param _proposalID The ID of the proposal to vote on
    /// @param _support Whether the caller votes in favour or against the proposal
    function vote(uint256 _proposalID, bool _support) override external onlySecurityMember() onlyLatestContract("rocketDAOSecurityProposals", address(this)) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress("rocketDAOProposal"));
        RocketDAOSecurityInterface daoSecurity = RocketDAOSecurityInterface(getContractAddress("rocketDAOSecurity"));
        // Did they join after this proposal was created? If so, they can't vote or it'll throw off the set proposalVotesRequired
        require(daoSecurity.getMemberJoinedTime(msg.sender) < daoProposal.getCreated(_proposalID), "Member cannot vote on proposal created before they became a member");
        // Vote now, one vote per trusted node member
        daoProposal.vote(msg.sender, 1 ether, _proposalID, _support);
    }

    /// @notice Cancel a proposal
    /// @param _proposalID The ID of the proposal to cancel
    function cancel(uint256 _proposalID) override external onlySecurityMember() onlyLatestContract("rocketDAOSecurityProposals", address(this)) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress("rocketDAOProposal"));
        // Cancel now, will succeed if it is the original proposer
        daoProposal.cancel(msg.sender, _proposalID);
    }

    /// @notice Execute a successful proposal
    /// @param _proposalID The ID of the proposal to execute
    function execute(uint256 _proposalID) override external onlyLatestContract("rocketDAOSecurityProposals", address(this)) {
        // Load contracts
        RocketDAOProposalInterface daoProposal = RocketDAOProposalInterface(getContractAddress("rocketDAOProposal"));
        // Execute now
        daoProposal.execute(_proposalID);
    }

    /*** Proposal - Settings **********************/

    /// @notice Change one of the current uint256 settings of the protocol DAO
    /// @param _settingNameSpace The namespace of the setting to change
    /// @param _settingPath The setting path to change
    /// @param _value The new value for the setting
    function proposalSettingUint(string memory _settingNameSpace, string memory _settingPath, uint256 _value) override public onlyExecutingContracts() onlyValidSetting(_settingNameSpace, _settingPath) {
        bytes32 namespace = keccak256(abi.encodePacked(protocolDaoSettingNamespace, _settingNameSpace));
        setUint(keccak256(abi.encodePacked(namespace, _settingPath)), _value);

        // Security council adder requires additional processing
        if (keccak256(bytes(_settingNameSpace)) == keccak256(bytes("network"))) {
            if (keccak256(bytes(_settingPath)) == keccak256(bytes("network.node.commission.share.security.council.adder"))) {
                RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));

                // Check guardrails
                uint256 maxAdderValue = rocketDAOProtocolSettingsNetwork.getMaxNodeShareSecurityCouncilAdder();
                require(_value <= maxAdderValue, "Value must be <= max value");
                uint256 maxVoterValue = rocketDAOProtocolSettingsNetwork.getVoterShare();
                require(_value <= maxVoterValue, "Value must be <= voter share");

                // Notify RocketNetworkRevenue of the changes to voter and node share
                RocketNetworkRevenuesInterface rocketNetworkRevenues = RocketNetworkRevenuesInterface(getContractAddress("rocketNetworkRevenues"));
                rocketNetworkRevenues.setVoterShare(rocketDAOProtocolSettingsNetwork.getEffectiveVoterShare());
                rocketNetworkRevenues.setNodeShare(rocketDAOProtocolSettingsNetwork.getEffectiveNodeShare());
            }
        }
    }

    /// @notice Change one of the current bool settings of the protocol DAO
    /// @param _settingNameSpace The namespace of the setting to change
    /// @param _settingPath The setting path to change
    /// @param _value The new value for the setting
    function proposalSettingBool(string memory _settingNameSpace, string memory _settingPath, bool _value) override public onlyExecutingContracts() onlyValidSetting(_settingNameSpace, _settingPath) {
        bytes32 namespace = keccak256(abi.encodePacked(protocolDaoSettingNamespace, _settingNameSpace));
        setBool(keccak256(abi.encodePacked(namespace, _settingPath)), _value);
    }

    /// @notice Change one of the current address settings of the protocol DAO
    /// @param _settingNameSpace The namespace of the setting to change
    /// @param _settingPath The setting path to change
    /// @param _value The new value for the setting
    function proposalSettingAddress(string memory _settingNameSpace, string memory _settingPath, address _value) override public onlyExecutingContracts() onlyValidSetting(_settingNameSpace, _settingPath) {
        bytes32 namespace = keccak256(abi.encodePacked(protocolDaoSettingNamespace, _settingNameSpace));
        setAddress(keccak256(abi.encodePacked(namespace, _settingPath)), _value);
    }

    /*** Proposal - Members **********************/

    /// @dev Called by rocketDAOProtocolProposals to execute an invite in this namespace
    /// @param _id A unique identifier for the new member
    /// @param _memberAddress The address of the new member
    function proposalInvite(string calldata _id, address _memberAddress) override public onlyLatestContract("rocketDAOProtocolProposals", msg.sender) {
        // Their proposal executed, record the block
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.executed.time", "invited", _memberAddress)), block.timestamp);
        // Ok all good, lets get their invitation and member data setup
        // They are initially only invited to join, so their membership isn't set as true until they accept it in RocketDAONodeTrustedActions
        _memberInit(_id, _memberAddress);
    }

    /// @dev Called by rocketDAOProtocolProposals to execute a kick in this namespace
    /// @param _memberAddress The address of the member to kick
    function proposalKick(address _memberAddress) override public onlyLatestContract("rocketDAOProtocolProposals", msg.sender) {
        // Load contracts
        RocketDAOSecurityActionsInterface daoActionsContract = RocketDAOSecurityActionsInterface(getContractAddress("rocketDAOSecurityActions"));
        // Kick them now
        daoActionsContract.actionKick(_memberAddress);
    }

    /// @dev Called by rocketDAOProtocolProposals to execute a kick of multiple members in this namespace
    /// @param _memberAddresses An array of addresses of the members to kick
    function proposalKickMulti(address[] calldata _memberAddresses) override public onlyLatestContract("rocketDAOProtocolProposals", msg.sender) {
        // Load contracts
        RocketDAOSecurityActionsInterface daoActionsContract = RocketDAOSecurityActionsInterface(getContractAddress("rocketDAOSecurityActions"));
        // Kick them now
        daoActionsContract.actionKickMulti(_memberAddresses);
    }

    /// @dev Called by rocketDAOProtocolProposals to execute an member replacement in this namespace
    /// @param _existingMemberAddress The address of the member to kick
    /// @param _newMemberId A unique identifier for the new member
    /// @param _newMemberAddress The address of the member to invite
    function proposalReplace(address _existingMemberAddress, string calldata _newMemberId, address _newMemberAddress) override external onlyLatestContract("rocketDAOProtocolProposals", msg.sender) {
        proposalKick(_existingMemberAddress);
        proposalInvite(_newMemberId, _newMemberAddress);
    }

    /*** Methods - Internal ***************/

    /// @dev Add a new potential members data, they must accept the invite to become an actual member
    /// @param _id A unique ID for the new member
    /// @param _memberAddress The address of the new member
    function _memberInit(string memory _id, address _memberAddress) private {
        // Load contracts
        RocketDAOSecurityInterface daoSecurity = RocketDAOSecurityInterface(getContractAddress("rocketDAOSecurity"));
        // Check current node status
        require(!daoSecurity.getMemberIsValid(_memberAddress), "This node is already part of the security council");
        // Verify the ID is min 3 chars
        require(bytes(_id).length >= 3, "The ID for this new member must be at least 3 characters");
        // Member initial data, not official until the bool is flagged as true
        setBool(keccak256(abi.encodePacked(daoNameSpace, "member", _memberAddress)), false);
        setAddress(keccak256(abi.encodePacked(daoNameSpace, "member.address", _memberAddress)), _memberAddress);
        setString(keccak256(abi.encodePacked(daoNameSpace, "member.id", _memberAddress)), _id);
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.joined.time", _memberAddress)), 0);
    }
}
