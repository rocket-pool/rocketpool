// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import "../../RocketBase.sol";
import "../../../interface/RocketVaultInterface.sol";
import "../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsSecurityInterface.sol";
import "../../../interface/dao/security/RocketDAOSecurityActionsInterface.sol";
import "../../../interface/dao/security/RocketDAOSecurityInterface.sol";
import "../../../interface/util/IERC20Burnable.sol";

import "../../../interface/util/AddressSetStorageInterface.sol";

/// @notice Executes proposals which affect security council members
contract RocketDAOSecurityActions is RocketBase, RocketDAOSecurityActionsInterface {

    // The namespace for any data stored in the network DAO (do not change)
    string constant internal daoNameSpace = "dao.security.";

    // Events
    event ActionJoined(address indexed nodeAddress, uint256 time);
    event ActionLeave(address indexed nodeAddress, uint256 time);
    event ActionRequestLeave(address indexed nodeAddress, uint256 time);
    event ActionKick(address indexed nodeAddress, uint256 time);

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    /*** Action Methods ************************/

    /// @notice Removes a member from the security council
    /// @param _memberAddress The address of the member to kick
    function actionKick(address _memberAddress) override public onlyLatestContract("rocketDAOSecurityProposals", msg.sender) {
        // Remove the member now
        _memberRemove(_memberAddress);
        // Log it
        emit ActionKick(_memberAddress, block.timestamp);
    }

    /// @notice Removes multiple members from the security council
    /// @param _memberAddresses An array of addresses of the member to kick
    function actionKickMulti(address[] calldata _memberAddresses) override external onlyLatestContract("rocketDAOSecurityProposals", msg.sender) {
        // Remove the members
        for (uint256 i = 0; i < _memberAddresses.length; ++i) {
            actionKick(_memberAddresses[i]);
        }
    }

    /// @notice An invited member can execute this function to join the security council
    function actionJoin() override external onlyLatestContract("rocketDAOSecurityActions", address(this)) {
        // Add the member
        _memberJoin(msg.sender);
        // Log it
        emit ActionJoined(msg.sender, block.timestamp);
    }

    /// @notice A member who wishes to leave the security council can call this method to initiate the process
    function actionRequestLeave() override external onlyLatestContract("rocketDAOSecurityActions", address(this)) {
        // Load contracts
        RocketDAOSecurityInterface rocketDAOSecurity = RocketDAOSecurityInterface(getContractAddress("rocketDAOSecurity"));
        RocketDAOProtocolSettingsSecurityInterface rocketDAOProtocolSettingsSecurity = RocketDAOProtocolSettingsSecurityInterface(getContractAddress("rocketDAOProtocolSettingsSecurity"));
        // Check they are currently a member
        require(rocketDAOSecurity.getMemberIsValid(msg.sender), "Not a current member");
        // Update the leave time to include the required notice period set by the protocol DAO
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.executed.time", "leave", msg.sender)), block.timestamp + rocketDAOProtocolSettingsSecurity.getLeaveTime());
        // Log it
        emit ActionRequestLeave(msg.sender, block.timestamp);
    }

    /// @notice A member who has asked to leave and waited the required time can call this method to formally leave the security council
    function actionLeave() override external onlyLatestContract("rocketDAOSecurityActions", address(this)) {
        // Load contracts
        RocketDAOSecurityInterface rocketDAOSecurity = RocketDAOSecurityInterface(getContractAddress("rocketDAOSecurity"));
        RocketDAOProtocolSettingsSecurityInterface rocketDAOProtocolSettingsSecurity = RocketDAOProtocolSettingsSecurityInterface(getContractAddress("rocketDAOProtocolSettingsSecurity"));
        // Check they are currently a member
        require(rocketDAOSecurity.getMemberIsValid(msg.sender), "Not a current member");
        // Get the time that they were approved to leave at
        uint256 leaveAcceptedTime = rocketDAOSecurity.getMemberProposalExecutedTime("leave", msg.sender);
        // Has the member waiting long enough?
        require(leaveAcceptedTime < block.timestamp, "Member has not waited required time to leave");
        // Has the leave request expired?
        require(leaveAcceptedTime + rocketDAOProtocolSettingsSecurity.getActionTime() > block.timestamp, "This member has not been approved to leave or request has expired, please apply to leave again");
        // Remove them now
        _memberRemove(msg.sender);
        // Log it
        emit ActionLeave(msg.sender, block.timestamp);
    }

    /*** Internal Methods ************************/

    /// @dev Removes a member from the security council
    function _memberRemove(address _nodeAddress) private {
        // Load contracts
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Remove their membership now
        deleteBool(keccak256(abi.encodePacked(daoNameSpace, "member", _nodeAddress)));
        deleteAddress(keccak256(abi.encodePacked(daoNameSpace, "member.address", _nodeAddress)));
        deleteString(keccak256(abi.encodePacked(daoNameSpace, "member.id", _nodeAddress)));
        deleteUint(keccak256(abi.encodePacked(daoNameSpace, "member.joined.time", _nodeAddress)));
        // Clean up the invited/leave proposals
        deleteUint(keccak256(abi.encodePacked(daoNameSpace, "member.executed.time", "invited", _nodeAddress)));
        deleteUint(keccak256(abi.encodePacked(daoNameSpace, "member.executed.time", "leave", _nodeAddress)));
        // Remove from member index now
        addressSetStorage.removeItem(keccak256(abi.encodePacked(daoNameSpace, "member.index")), _nodeAddress);
    }

    /// @dev A member official joins the security council, if successful they are added as a member
    function _memberJoin(address _nodeAddress) private {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Load contracts
        RocketDAOSecurityInterface rocketDAOSecurity = RocketDAOSecurityInterface(getContractAddress("rocketDAOSecurity"));
        RocketDAOProtocolSettingsSecurityInterface rocketDAOProtocolSettingsSecurity = RocketDAOProtocolSettingsSecurityInterface(getContractAddress("rocketDAOProtocolSettingsSecurity"));
        // The time that the member was successfully invited to join the DAO
        uint256 memberInvitedTime = rocketDAOSecurity.getMemberProposalExecutedTime("invited", _nodeAddress);
        // Have they been invited?
        require(memberInvitedTime > 0, "This address has not been invited to join");
        // Has their invite expired?
        require(memberInvitedTime + rocketDAOProtocolSettingsSecurity.getActionTime() > block.timestamp, "This node's invitation to join has expired, please apply again");
        // Check current node status
        require(rocketDAOSecurity.getMemberIsValid(_nodeAddress) != true, "This node is already part of the security council");
        // Mark them as a valid security council member
        setBool(keccak256(abi.encodePacked(daoNameSpace, "member", _nodeAddress)), true);
        // Record the block number they joined at
        setUint(keccak256(abi.encodePacked(daoNameSpace, "member.joined.time", _nodeAddress)), block.timestamp);
        // Add to member index now
        addressSetStorage.addItem(keccak256(abi.encodePacked(daoNameSpace, "member.index")), _nodeAddress);
    }
}
