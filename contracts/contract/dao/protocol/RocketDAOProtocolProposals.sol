// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import "../../RocketBase.sol";
import "../../../interface/dao/protocol/RocketDAOProtocolInterface.sol";
import "../../../interface/dao/protocol/RocketDAOProtocolProposalsInterface.sol";
import "../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsInterface.sol";
import "../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsRewardsInterface.sol";
import "../../../interface/rewards/claims/RocketClaimDAOInterface.sol";
import "../../../interface/dao/RocketDAOProposalInterface.sol";
import "../../../interface/node/RocketNodeManagerInterface.sol";
import "../../../types/SettingType.sol";
import "../../../interface/dao/protocol/RocketDAOProtocolVerifierInterface.sol";
import "../../../interface/network/RocketNetworkVotingInterface.sol";
import "../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsProposalsInterface.sol";
import "../../../interface/dao/security/RocketDAOSecurityInterface.sol";
import "../../../interface/dao/security/RocketDAOSecurityProposalsInterface.sol";

/// @notice Manages protocol DAO proposals
contract RocketDAOProtocolProposals is RocketBase, RocketDAOProtocolProposalsInterface {
    // Events
    event ProposalSettingUint(string settingContractName, string settingPath, uint256 value, uint256 time);
    event ProposalSettingBool(string settingContractName, string settingPath, bool value, uint256 time);
    event ProposalSettingAddress(string settingContractName, string settingPath, address value, uint256 time);
    event ProposalSettingAddressList(string settingContractName, string settingPath, address[] value, uint256 time);
    event ProposalSettingRewardsClaimers(uint256 trustedNodePercent, uint256 protocolPercent, uint256 nodePercent, uint256 time);
    event ProposalSecurityInvite(string id, address memberAddress, uint256 time);
    event ProposalSecurityKick(address memberAddress, uint256 time);
    event ProposalSecurityKickMulti(address[] memberAddresses, uint256 time);
    event ProposalSecurityReplace(address existingMemberAddress, string newMemberId, address newMemberAddress, uint256 time);

    // Only allow certain contracts to execute methods
    modifier onlyExecutingContracts() {
        // Methods are either executed by bootstrapping methods in rocketDAONodeTrusted or by people executing passed proposals on this contract
        require(msg.sender == getContractAddress("rocketDAOProtocol") || msg.sender == getContractAddress("rocketDAOProtocolProposal"), "Sender is not permitted to access executing methods");
        _;
    }

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 3;
    }

    /*** Proposal - Settings ***************/

    /// @notice Set multiple settings in one proposal. It is required that all input arrays are the same length.
    /// @param _settingContractNames An array of contract names
    /// @param _settingPaths An array of setting paths
    /// @param _types An array of the type of values to set
    /// @param _data An array of ABI encoded values to set
    function proposalSettingMulti(string[] memory _settingContractNames, string[] memory _settingPaths, SettingType[] memory _types, bytes[] memory _data) override external onlyExecutingContracts() {
        // Check lengths of all arguments are the same
        require(_settingContractNames.length == _settingPaths.length && _settingPaths.length == _types.length && _types.length == _data.length, "Invalid parameters supplied");
        // Loop through settings
        for (uint256 i = 0; i < _settingContractNames.length; ++i) {
            if (_types[i] == SettingType.UINT256) {
                uint256 value = abi.decode(_data[i], (uint256));
                proposalSettingUint(_settingContractNames[i], _settingPaths[i], value);
            } else if (_types[i] == SettingType.BOOL) {
                bool value = abi.decode(_data[i], (bool));
                proposalSettingBool(_settingContractNames[i], _settingPaths[i], value);
            } else if (_types[i] == SettingType.ADDRESS) {
                address value = abi.decode(_data[i], (address));
                proposalSettingAddress(_settingContractNames[i], _settingPaths[i], value);
            } else {
                revert("Invalid setting type");
            }
        }
    }

    /// @notice Change one of the current uint256 settings of the protocol DAO
    /// @param _settingContractName Contract name of the setting to change
    /// @param _settingPath Setting path to change
    /// @param _value New setting value
    function proposalSettingUint(string memory _settingContractName, string memory _settingPath, uint256 _value) override public onlyExecutingContracts() {
        RocketDAOProtocolSettingsInterface rocketDAOProtocolSettings = RocketDAOProtocolSettingsInterface(getContractAddress(_settingContractName));
        rocketDAOProtocolSettings.setSettingUint(_settingPath, _value);
        emit ProposalSettingUint(_settingContractName, _settingPath, _value, block.timestamp);
    }

    /// @notice Change one of the current bool settings of the protocol DAO
    /// @param _settingContractName Contract name of the setting to change
    /// @param _settingPath Setting path to change
    /// @param _value New setting value
    function proposalSettingBool(string memory _settingContractName, string memory _settingPath, bool _value) override public onlyExecutingContracts() {
        RocketDAOProtocolSettingsInterface rocketDAOProtocolSettings = RocketDAOProtocolSettingsInterface(getContractAddress(_settingContractName));
        rocketDAOProtocolSettings.setSettingBool(_settingPath, _value);
        emit ProposalSettingBool(_settingContractName, _settingPath, _value, block.timestamp);
    }

    /// @notice Change one of the current address settings of the protocol DAO
    /// @param _settingContractName Contract name of the setting to change
    /// @param _settingPath Setting path to change
    /// @param _value New setting value
    function proposalSettingAddress(string memory _settingContractName, string memory _settingPath, address _value) override public onlyExecutingContracts() {
        RocketDAOProtocolSettingsInterface rocketDAOProtocolSettings = RocketDAOProtocolSettingsInterface(getContractAddress(_settingContractName));
        rocketDAOProtocolSettings.setSettingAddress(_settingPath, _value);
        emit ProposalSettingAddress(_settingContractName, _settingPath, _value, block.timestamp);
    }

    /// @notice Change one of the current address[] settings of the protocol DAO
    /// @param _settingContractName Contract name of the setting to change
    /// @param _settingPath Setting path to change
    /// @param _value[] New setting value
    function proposalSettingAddressList(string memory _settingContractName, string memory _settingPath, address[] calldata _value) override public onlyExecutingContracts() {
        RocketDAOProtocolSettingsInterface rocketDAOProtocolSettings = RocketDAOProtocolSettingsInterface(getContractAddress(_settingContractName));
        rocketDAOProtocolSettings.setSettingAddressList(_settingPath, _value);
        emit ProposalSettingAddressList(_settingContractName, _settingPath, _value, block.timestamp);
    }

    /// @notice Updates the percentages the trusted nodes use when calculating RPL reward trees. Percentages must add up to 100%
    /// @param _trustedNodePercent The percentage of rewards paid to the trusted node set (as a fraction of 1e18)
    /// @param _protocolPercent The percentage of rewards paid to the protocol dao (as a fraction of 1e18)
    /// @param _nodePercent The percentage of rewards paid to the node operators (as a fraction of 1e18)
    function proposalSettingRewardsClaimers(uint256 _trustedNodePercent, uint256 _protocolPercent, uint256 _nodePercent) override external onlyExecutingContracts() {
        RocketDAOProtocolSettingsRewardsInterface rocketDAOProtocolSettingsRewards = RocketDAOProtocolSettingsRewardsInterface(getContractAddress("rocketDAOProtocolSettingsRewards"));
        rocketDAOProtocolSettingsRewards.setSettingRewardsClaimers(_trustedNodePercent, _protocolPercent, _nodePercent);
        emit ProposalSettingRewardsClaimers(_trustedNodePercent, _protocolPercent, _nodePercent, block.timestamp);
    }

    /// @notice Spend RPL from the DAO's treasury immediately
    /// @param _invoiceID Arbitrary string for book keeping
    /// @param _recipientAddress Address to receive the RPL
    /// @param _amount Amount of RPL to send
    function proposalTreasuryOneTimeSpend(string memory _invoiceID, address _recipientAddress, uint256 _amount) override external onlyExecutingContracts() {
        RocketClaimDAOInterface rocketDAOTreasury = RocketClaimDAOInterface(getContractAddress("rocketClaimDAO"));
        rocketDAOTreasury.spend(_invoiceID, _recipientAddress, _amount);
    }

    /// @notice Add a new recurring payment contract to the treasury
    /// @param _contractName A unique string to refer to this payment contract
    /// @param _recipientAddress Address to receive the periodic RPL
    /// @param _amountPerPeriod Amount of RPL to pay per period
    /// @param _periodLength Number of seconds between each period
    /// @param _startTime Timestamp of when payments should begin
    /// @param _numPeriods Number periods to pay, or zero for a never ending contract
    function proposalTreasuryNewContract(string memory _contractName, address _recipientAddress, uint256 _amountPerPeriod, uint256 _periodLength, uint256 _startTime, uint256 _numPeriods) override external onlyExecutingContracts() {
        RocketClaimDAOInterface rocketDAOTreasury = RocketClaimDAOInterface(getContractAddress("rocketClaimDAO"));
        rocketDAOTreasury.newContract(_contractName, _recipientAddress, _amountPerPeriod, _periodLength, _startTime, _numPeriods);
    }

    /// @notice Modifies and existing recurring payment contract
    /// @param _contractName The unique string of the payment contract
    /// @param _recipientAddress New address to receive the periodic RPL
    /// @param _amountPerPeriod New amount of RPL to pay per period
    /// @param _periodLength New number of seconds between each period
    /// @param _numPeriods New number periods to pay, or zero for a never ending contract
    function proposalTreasuryUpdateContract(string memory _contractName, address _recipientAddress, uint256 _amountPerPeriod, uint256 _periodLength, uint256 _numPeriods) override external onlyExecutingContracts() {
        RocketClaimDAOInterface rocketDAOTreasury = RocketClaimDAOInterface(getContractAddress("rocketClaimDAO"));
        rocketDAOTreasury.updateContract(_contractName, _recipientAddress, _amountPerPeriod, _periodLength, _numPeriods);
    }

    /// @notice Invites an address to join the security council
    /// @param _id A string to identify this member with
    /// @param _memberAddress The address of the new member
    function proposalSecurityInvite(string calldata _id, address _memberAddress) override external onlyExecutingContracts() {
        RocketDAOSecurityProposalsInterface rocketDAOSecurityProposals = RocketDAOSecurityProposalsInterface(getContractAddress("rocketDAOSecurityProposals"));
        rocketDAOSecurityProposals.proposalInvite(_id, _memberAddress);
        emit ProposalSecurityInvite(_id, _memberAddress, block.timestamp);
    }

    /// @notice Propose to kick a current member from the security council
    /// @param _memberAddress The address of the member to kick
    function proposalSecurityKick(address _memberAddress) override external onlyExecutingContracts() {
        RocketDAOSecurityProposalsInterface rocketDAOSecurityProposals = RocketDAOSecurityProposalsInterface(getContractAddress("rocketDAOSecurityProposals"));
        rocketDAOSecurityProposals.proposalKick(_memberAddress);
        emit ProposalSecurityKick(_memberAddress, block.timestamp);
    }

    /// @notice Propose to kick multiple current members from the security council
    /// @param _memberAddresses An array of addresses of the members to kick
    function proposalSecurityKickMulti(address[] calldata _memberAddresses) override external onlyExecutingContracts() {
        RocketDAOSecurityProposalsInterface rocketDAOSecurityProposals = RocketDAOSecurityProposalsInterface(getContractAddress("rocketDAOSecurityProposals"));
        rocketDAOSecurityProposals.proposalKickMulti(_memberAddresses);
        emit ProposalSecurityKickMulti(_memberAddresses, block.timestamp);
    }

    /// @notice Propose to replace a current member from the security council
    /// @param _existingMemberAddress The address of the member to kick
    /// @param _newMemberId A string to identify this member with
    /// @param _newMemberAddress The address of the new member
    function proposalSecurityReplace(address _existingMemberAddress, string calldata _newMemberId, address _newMemberAddress) override external onlyExecutingContracts() {
        RocketDAOSecurityProposalsInterface rocketDAOSecurityProposals = RocketDAOSecurityProposalsInterface(getContractAddress("rocketDAOSecurityProposals"));
        rocketDAOSecurityProposals.proposalReplace(_existingMemberAddress, _newMemberId, _newMemberAddress);
        emit ProposalSecurityReplace(_existingMemberAddress, _newMemberId, _newMemberAddress, block.timestamp);
    }
}
