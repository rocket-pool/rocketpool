pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "./RocketDAOProtocolSettings.sol";
import "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol";
import "../../../../interface/network/RocketNetworkSnapshotsInterface.sol";

// Network auction settings

contract RocketDAOProtocolSettingsNode is RocketDAOProtocolSettings, RocketDAOProtocolSettingsNodeInterface {

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "node") {
        // Set version
        version = 4;
        // Initialize settings on deployment
        if(!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // Apply settings
            setSettingBool("node.registration.enabled", false);
            setSettingBool("node.smoothing.pool.registration.enabled", true);
            setSettingBool("node.deposit.enabled", false);
            setSettingBool("node.vacant.minipools.enabled", false);
            setSettingUint("node.per.minipool.stake.minimum", 0.1 ether);      // 10% of user ETH value (matched ETH)
            setSettingUint("node.per.minipool.stake.maximum", 1.5 ether);      // 150% of node ETH value (provided ETH)
            // Settings initialised
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
        }
    }

    /// @notice Update a setting, overrides inherited setting method with extra checks for this contract
    function setSettingUint(string memory _settingPath, uint256 _value) override public onlyDAOProtocolProposal {
        bytes32 settingKey = keccak256(bytes(_settingPath));
        if(settingKey == keccak256(bytes("node.voting.power.stake.maximum"))) {
            // Redirect the setting change to push a new value into the snapshot system instead
            RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
            rocketNetworkSnapshots.push(settingKey, uint224(_value));
            return;
        }
        // Update setting now
        setUint(keccak256(abi.encodePacked(settingNameSpace, _settingPath)), _value);
    }

    // Node registrations currently enabled
    function getRegistrationEnabled() override external view returns (bool) {
        return getSettingBool("node.registration.enabled");
    }

    // Node smoothing pool registrations currently enabled
    function getSmoothingPoolRegistrationEnabled() override external view returns (bool) {
        return getSettingBool("node.smoothing.pool.registration.enabled");
    }

    // Node deposits currently enabled
    function getDepositEnabled() override external view returns (bool) {
        return getSettingBool("node.deposit.enabled");
    }

    // Vacant minipools currently enabled
    function getVacantMinipoolsEnabled() override external view returns (bool) {
        return getSettingBool("node.vacant.minipools.enabled");
    }

    // Minimum RPL stake per minipool as a fraction of assigned user ETH value
    function getMinimumPerMinipoolStake() override external view returns (uint256) {
        return getSettingUint("node.per.minipool.stake.minimum");
    }

    // Maximum RPL stake per minipool as a fraction of assigned user ETH value
    function getMaximumPerMinipoolStake() override external view returns (uint256) {
        return getSettingUint("node.per.minipool.stake.maximum");
    }

    // Maximum staked RPL that applies to voting power per minipool as a fraction of assigned user ETH value
    function getMaximumStakeForVotingPower() override external view returns (uint256) {
        bytes32 settingKey = keccak256(bytes("node.voting.power.stake.maximum"));
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        return uint256(rocketNetworkSnapshots.latestValue(settingKey));
    }
}
