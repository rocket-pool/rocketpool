pragma solidity 0.7.6;
pragma abicoder v2;

// SPDX-License-Identifier: GPL-3.0-only

import "../../RocketBase.sol";
import "../../../interface/dao/protocol/RocketDAOProtocolInterface.sol";
import "../../../interface/dao/protocol/RocketDAOProtocolProposalsInterface.sol";
import "../../../types/SettingType.sol";


// The Rocket Pool Network DAO - This is a placeholder for the network DAO to come
contract RocketDAOProtocol is RocketBase, RocketDAOProtocolInterface {

    // The namespace for any data stored in the network DAO (do not change)
    string constant daoNameSpace = "dao.protocol.";

    // Only allow bootstrapping when enabled
    modifier onlyBootstrapMode() {
        require(getBootstrapModeDisabled() == false, "Bootstrap mode not engaged");
        _;
    }

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        // Version
        version = 1;
    }


    /**** DAO Properties **************/

    // Returns true if bootstrap mode is disabled
    function getBootstrapModeDisabled() override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked(daoNameSpace, "bootstrapmode.disabled")));
    }

    // Get the last time this user made a proposal
    function getMemberLastProposalTime(address _nodeAddress) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked(daoNameSpace, "member.proposal.lasttime", _nodeAddress)));
    }

    /**** Bootstrapping ***************/
    // While bootstrap mode is engaged, RP can change settings alongside the DAO (when its implemented). When disabled, only DAO will be able to control settings

    // Bootstrap mode - multi Setting
    function bootstrapSettingMulti(string[] memory _settingContractNames, string[] memory _settingPaths, SettingType[] memory _types, bytes[] memory _values) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
      // Ok good to go, lets update the settings
      RocketDAOProtocolProposalsInterface(getContractAddress("rocketDAOProtocolProposals")).proposalSettingMulti(_settingContractNames, _settingPaths, _types, _values);
    }

    // Bootstrap mode - Uint Setting
    function bootstrapSettingUint(string memory _settingContractName, string memory _settingPath, uint256 _value) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        // Ok good to go, lets update the settings
        RocketDAOProtocolProposalsInterface(getContractAddress("rocketDAOProtocolProposals")).proposalSettingUint(_settingContractName, _settingPath, _value);
    }

    // Bootstrap mode - Bool Setting
    function bootstrapSettingBool(string memory _settingContractName, string memory _settingPath, bool _value) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        // Ok good to go, lets update the settings 
        RocketDAOProtocolProposalsInterface(getContractAddress("rocketDAOProtocolProposals")).proposalSettingBool(_settingContractName, _settingPath, _value);
    }

    // Bootstrap mode - Address Setting
    function bootstrapSettingAddress(string memory _settingContractName, string memory _settingPath, address _value) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        // Ok good to go, lets update the settings 
        RocketDAOProtocolProposalsInterface(getContractAddress("rocketDAOProtocolProposals")).proposalSettingAddress(_settingContractName, _settingPath, _value);
    }

    // Bootstrap mode - Set a claiming contract to receive a % of RPL inflation rewards
    function bootstrapSettingClaimers(uint256 _trustedNodePerc, uint256 _protocolPerc, uint256 _nodePerc) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        // Ok good to go, lets update the rewards claiming contract amount 
        RocketDAOProtocolProposalsInterface(getContractAddress("rocketDAOProtocolProposals")).proposalSettingRewardsClaimers(_trustedNodePerc, _protocolPerc, _nodePerc);
    }

    // Bootstrap mode - Spend DAO treasury
    function bootstrapSpendTreasury(string memory _invoiceID, address _recipientAddress, uint256 _amount) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        RocketDAOProtocolProposalsInterface(getContractAddress("rocketDAOProtocolProposals")).proposalTreasuryOneTimeSpend(_invoiceID, _recipientAddress, _amount);
    }

    // Bootstrap mode - New treasury contract
    function bootstrapTreasuryNewContract(string memory _contractName, address _recipientAddress, uint256 _amountPerPeriod, uint256 _periodLength, uint256 _startTime, uint256 _numPeriods) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        RocketDAOProtocolProposalsInterface(getContractAddress("rocketDAOProtocolProposals")).proposalTreasuryNewContract(_contractName, _recipientAddress, _amountPerPeriod, _periodLength, _startTime, _numPeriods);
    }

    // Bootstrap mode - Update treasury contract
    function bootstrapTreasuryUpdateContract(string memory _contractName, address _recipientAddress, uint256 _amountPerPeriod, uint256 _periodLength, uint256 _numPeriods) override external  onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        RocketDAOProtocolProposalsInterface(getContractAddress("rocketDAOProtocolProposals")).proposalTreasuryUpdateContract(_contractName, _recipientAddress, _amountPerPeriod, _periodLength, _numPeriods);
    }

    // Bootstrap mode - Invite security council member
    function bootstrapSecurityInvite(string memory _id, address _memberAddress) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        RocketDAOProtocolProposalsInterface(getContractAddress("rocketDAOProtocolProposals")).proposalSecurityInvite(_id, _memberAddress);
    }

    // Bootstrap mode - Kick security council member
    function bootstrapSecurityKick(address _memberAddress) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        RocketDAOProtocolProposalsInterface(getContractAddress("rocketDAOProtocolProposals")).proposalSecurityKick(_memberAddress);
    }

    // Bootstrap mode - Disable RP Access (only RP can call this to hand over full control to the DAO)
    function bootstrapDisable(bool _confirmDisableBootstrapMode) override external onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        require(_confirmDisableBootstrapMode == true, "You must confirm disabling bootstrap mode, it can only be done once!");
        setBool(keccak256(abi.encodePacked(daoNameSpace, "bootstrapmode.disabled")), true);
    }

}
