// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketStorageInterface} from "../../../../interface/RocketStorageInterface.sol";
import {RocketDAOProtocolSettings} from "./RocketDAOProtocolSettings.sol";
import {RocketDAOProtocolSettingsNodeInterface} from "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol";
import {RocketNetworkSnapshotsInterface} from "../../../../interface/network/RocketNetworkSnapshotsInterface.sol";

/// @notice Network auction settings
contract RocketDAOProtocolSettingsNode is RocketDAOProtocolSettings, RocketDAOProtocolSettingsNodeInterface {
    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "node") {
        // Set version
        version = 5;
        // Initialise settings on deployment
        if (!rocketStorage.getDeployedStatus()) {
            // Set defaults
            setSettingBool("node.registration.enabled", false);
            setSettingBool("node.smoothing.pool.registration.enabled", true);
            setSettingBool("node.deposit.enabled", false);
            setSettingBool("node.vacant.minipools.enabled", false);
            _setSettingUint("node.per.minipool.stake.minimum", 0.1 ether);      // 10% of user ETH value (borrowed ETH)
            _setSettingUint("node.per.minipool.stake.maximum", 1.5 ether);      // 150% of node ETH value (bonded ETH)
            _setSettingUint("reduced.bond", 4 ether);                           // 4 ETH (RPIP-42)
            _setSettingUint("node.unstaking.period", 28 days);                  // 28 days (RPIP-30)
            // Update deployed flag
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
        }
    }

    /// @notice Update a setting, overrides inherited setting method with extra checks for this contract
    function setSettingUint(string memory _settingPath, uint256 _value) override public onlyDAOProtocolProposal {
        if(getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            bytes32 settingKey = keccak256(bytes(_settingPath));
            if(settingKey == keccak256(bytes("node.voting.power.stake.maximum"))) {
                // Redirect the setting change to push a new value into the snapshot system instead
                RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
                rocketNetworkSnapshots.push(settingKey, uint224(_value));
                return;
            }
        }
        // Update setting now
        _setSettingUint(_settingPath, _value);
    }

    /// @dev Directly updates a setting, no guardrails applied
    function _setSettingUint(string memory _settingPath, uint256 _value) internal {
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

    /// @notice Returns the `reduced_bond` variable used in bond requirements calculation
    function getReducedBond() override external view returns (uint256) {
        return getSettingUint("reduced.bond");
    }

    /// @notice Returns the `base_bond_array` mapping of number of validators to cumulative bond requirement
    function getBaseBondArray() override public pure returns (uint256[] memory) {
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 4 ether;
        amounts[1] = 8 ether;
        return amounts;
    }

    /// @notice Returns the amount of time that must be waiting after unstaking RPL before it can be returned
    function getUnstakingPeriod() override external view returns (uint256) {
        return getSettingUint("node.unstaking.period");
    }
}
