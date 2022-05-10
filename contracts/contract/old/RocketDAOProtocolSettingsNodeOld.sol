pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../../interface/old/RocketDAOProtocolSettingsNodeInterfaceOld.sol";
import "../dao/protocol/settings/RocketDAOProtocolSettings.sol";

// Network auction settings

contract RocketDAOProtocolSettingsNodeOld is RocketDAOProtocolSettings, RocketDAOProtocolSettingsNodeInterfaceOld {

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "node") {
        // Set version
        version = 1;
        // Initialize settings on deployment
        if(!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // Apply settings
            setSettingBool("node.registration.enabled", false);
            setSettingBool("node.deposit.enabled", false);
            setSettingUint("node.per.minipool.stake.minimum", 0.1 ether);      // 10% of user ETH value
            setSettingUint("node.per.minipool.stake.maximum", 1.5 ether);      // 150% of user ETH value
            // Settings initialised
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
        }
    }

    // Node registrations currently enabled
    function getRegistrationEnabled() override external view returns (bool) {
        return getSettingBool("node.registration.enabled");
    }

    // Node deposits currently enabled
    function getDepositEnabled() override external view returns (bool) {
        return getSettingBool("node.deposit.enabled");
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