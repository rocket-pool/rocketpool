// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;
pragma abicoder v2;

import {RocketStorageInterface} from "../../../interface/RocketStorageInterface.sol";
import {RocketDAOProtocolInterface} from "../../../interface/dao/protocol/RocketDAOProtocolInterface.sol";
import {RocketDAOProtocolProposalsInterface} from "../../../interface/dao/protocol/RocketDAOProtocolProposalsInterface.sol";
import {SettingType} from "../../../types/SettingType.sol";
import {RocketBase} from "../../RocketBase.sol";

/// @notice The Rocket Pool Protocol DAO (pDAO)
contract RocketDAOProtocol is RocketBase, RocketDAOProtocolInterface {
    // Events
    event BootstrapSettingMulti(string[] settingContractNames, string[] settingPaths, SettingType[] types, bytes[] values, uint256 time);
    event BootstrapSettingUint(string settingContractName, string settingPath, uint256 value, uint256 time);
    event BootstrapSettingBool(string settingContractName, string settingPath, bool value, uint256 time);
    event BootstrapSettingAddress(string settingContractName, string settingPath, address value, uint256 time);
    event BootstrapSettingAddressList(string settingContractName, string settingPath, address[] value, uint256 time);
    event BootstrapSettingClaimers(uint256 trustedNodePercent, uint256 protocolPercent, uint256 nodePercent, uint256 time);
    event BootstrapSpendTreasury(string invoiceID, address recipientAddress, uint256 amount, uint256 time);
    event BootstrapTreasuryNewContract(string contractName, address recipientAddress, uint256 amountPerPeriod, uint256 periodLength, uint256 startTime, uint256 numPeriods, uint256 time);
    event BootstrapTreasuryUpdateContract(string contractName, address recipientAddress, uint256 amountPerPeriod, uint256 periodLength, uint256 numPeriods, uint256 time);
    event BootstrapSecurityInvite(string id, address memberAddress, uint256 time);
    event BootstrapSecurityKick(address memberAddress, uint256 time);
    event BootstrapDisabled(uint256 time);
    event BootstrapProtocolDAOEnabled(uint256 block, uint256 time);

    // The namespace for any data stored in the network DAO (do not change)
    string constant internal daoNameSpace = "dao.protocol.";

    // Only allow bootstrapping when enabled
    modifier onlyBootstrapMode() {
        require(getBootstrapModeDisabled() == false, "Bootstrap mode not engaged");
        _;
    }

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 3;
    }

    /**** DAO Properties **************/

    /// @notice Returns true if bootstrap mode is disabled
    function getBootstrapModeDisabled() override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked(daoNameSpace, "bootstrapmode.disabled")));
    }

    /// @notice Get the last time this user made a proposal
    function getMemberLastProposalTime(address _nodeAddress) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "member.proposal.lasttime", _nodeAddress)));
    }

    /**** Bootstrapping ***************/
    // While bootstrap mode is engaged, RP can change settings alongside the DAO. When disabled, only DAO will be able to control settings

    /// @notice Bootstrap mode - multi Setting
    function bootstrapSettingMulti(string[] memory _settingContractNames, string[] memory _settingPaths, SettingType[] memory _types, bytes[] memory _values) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        RocketDAOProtocolProposalsInterface(getContractAddress("rocketDAOProtocolProposals")).proposalSettingMulti(_settingContractNames, _settingPaths, _types, _values);
        emit BootstrapSettingMulti(_settingContractNames, _settingPaths, _types, _values, block.timestamp);
    }

    /// @notice Bootstrap mode - Uint Setting
    function bootstrapSettingUint(string memory _settingContractName, string memory _settingPath, uint256 _value) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        RocketDAOProtocolProposalsInterface(getContractAddress("rocketDAOProtocolProposals")).proposalSettingUint(_settingContractName, _settingPath, _value);
        emit BootstrapSettingUint(_settingContractName, _settingPath, _value, block.timestamp);
    }

    /// @notice Bootstrap mode - Bool Setting
    function bootstrapSettingBool(string memory _settingContractName, string memory _settingPath, bool _value) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        RocketDAOProtocolProposalsInterface(getContractAddress("rocketDAOProtocolProposals")).proposalSettingBool(_settingContractName, _settingPath, _value);
        emit BootstrapSettingBool(_settingContractName, _settingPath, _value, block.timestamp);
    }

    /// @notice Bootstrap mode - Address Setting
    function bootstrapSettingAddress(string memory _settingContractName, string memory _settingPath, address _value) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        RocketDAOProtocolProposalsInterface(getContractAddress("rocketDAOProtocolProposals")).proposalSettingAddress(_settingContractName, _settingPath, _value);
        emit BootstrapSettingAddress(_settingContractName, _settingPath, _value, block.timestamp);
    }

    /// @notice Bootstrap mode - Address list Setting
    function bootstrapSettingAddressList(string memory _settingContractName, string memory _settingPath, address[] calldata _value) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        RocketDAOProtocolProposalsInterface(getContractAddress("rocketDAOProtocolProposals")).proposalSettingAddressList(_settingContractName, _settingPath, _value);
        emit BootstrapSettingAddressList(_settingContractName, _settingPath, _value, block.timestamp);
    }

    /// @notice Bootstrap mode - Set a claiming contract to receive a % of RPL inflation rewards
    function bootstrapSettingClaimers(uint256 _trustedNodePercent, uint256 _protocolPercent, uint256 _nodePercent) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        RocketDAOProtocolProposalsInterface(getContractAddress("rocketDAOProtocolProposals")).proposalSettingRewardsClaimers(_trustedNodePercent, _protocolPercent, _nodePercent);
        emit BootstrapSettingClaimers(_trustedNodePercent, _protocolPercent, _nodePercent, block.timestamp);
    }

    /// @notice Bootstrap mode - Spend DAO treasury
    function bootstrapSpendTreasury(string memory _invoiceID, address _recipientAddress, uint256 _amount) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        RocketDAOProtocolProposalsInterface(getContractAddress("rocketDAOProtocolProposals")).proposalTreasuryOneTimeSpend(_invoiceID, _recipientAddress, _amount);
        emit BootstrapSpendTreasury(_invoiceID, _recipientAddress, _amount, block.timestamp);
    }

    /// @notice Bootstrap mode - New treasury contract
    function bootstrapTreasuryNewContract(string memory _contractName, address _recipientAddress, uint256 _amountPerPeriod, uint256 _periodLength, uint256 _startTime, uint256 _numPeriods) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        RocketDAOProtocolProposalsInterface(getContractAddress("rocketDAOProtocolProposals")).proposalTreasuryNewContract(_contractName, _recipientAddress, _amountPerPeriod, _periodLength, _startTime, _numPeriods);
        emit BootstrapTreasuryNewContract(_contractName, _recipientAddress, _amountPerPeriod, _periodLength, _startTime, _numPeriods, block.timestamp);
    }

    /// @notice Bootstrap mode - Update treasury contract
    function bootstrapTreasuryUpdateContract(string memory _contractName, address _recipientAddress, uint256 _amountPerPeriod, uint256 _periodLength, uint256 _numPeriods) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        RocketDAOProtocolProposalsInterface(getContractAddress("rocketDAOProtocolProposals")).proposalTreasuryUpdateContract(_contractName, _recipientAddress, _amountPerPeriod, _periodLength, _numPeriods);
        emit BootstrapTreasuryUpdateContract(_contractName, _recipientAddress, _amountPerPeriod, _periodLength, _numPeriods, block.timestamp);
    }

    /// @notice Bootstrap mode - Invite security council member
    function bootstrapSecurityInvite(string memory _id, address _memberAddress) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        RocketDAOProtocolProposalsInterface(getContractAddress("rocketDAOProtocolProposals")).proposalSecurityInvite(_id, _memberAddress);
        emit BootstrapSecurityInvite(_id, _memberAddress, block.timestamp);
    }

    /// @notice Bootstrap mode - Kick security council member
    function bootstrapSecurityKick(address _memberAddress) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        RocketDAOProtocolProposalsInterface(getContractAddress("rocketDAOProtocolProposals")).proposalSecurityKick(_memberAddress);
        emit BootstrapSecurityKick(_memberAddress, block.timestamp);
    }

    /// @notice Bootstrap mode - Disable RP Access (only RP can call this to hand over full control to the DAO)
    function bootstrapDisable(bool _confirmDisableBootstrapMode) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        // Prevent disabling bootstrap if on-chain governance has not been enabled
        require(getUint(keccak256(abi.encodePacked("protocol.dao.enabled.block"))) > 0, "On-chain governance must be enabled first");
        // Disable bootstrap
        require(_confirmDisableBootstrapMode == true, "You must confirm disabling bootstrap mode, it can only be done once!");
        setBool(keccak256(abi.encodePacked(daoNameSpace, "bootstrapmode.disabled")), true);
        emit BootstrapDisabled(block.timestamp);
    }

    /// @notice Bootstrap mode - Enables on-chain governance proposals
    function bootstrapEnableGovernance() override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        setUint(keccak256(abi.encodePacked("protocol.dao.enabled.block")), block.number);
        emit BootstrapProtocolDAOEnabled(block.number, block.timestamp);
    }
}
