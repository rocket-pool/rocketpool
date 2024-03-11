pragma solidity 0.7.6;

import "../../../../../contract/dao/protocol/settings/RocketDAOProtocolSettings.sol";
import "../../../../../interface/network/RocketNetworkSnapshotsInterface.sol";
import "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterfaceOld.sol";

// SPDX-License-Identifier: GPL-3.0-only


// Network auction settings

contract RocketDAOProtocolSettingsNodeOld is RocketDAOProtocolSettings, RocketDAOProtocolSettingsNodeInterfaceOld {

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "node") {
        // Set version
        version = 3;
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

}