pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/settings/RocketNodeSettingsInterface.sol";

// Network node settings

contract RocketNodeSettings is RocketBase, RocketNodeSettingsInterface {

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Set version
        version = 1;
        // Initialize settings on deployment
        if (!getBoolS("settings.node.init")) {
            // Apply settings
            setRegistrationEnabled(true);
            setDepositEnabled(true);
            // Settings initialized
            setBoolS("settings.node.init", true);
        }
    }

    // Node registrations currently enabled
    function getRegistrationEnabled() override public view returns (bool) {
        return getBoolS("settings.node.registration.enabled");
    }
    function setRegistrationEnabled(bool _value) public onlyOwner {
        setBoolS("settings.node.registration.enabled", _value);
    }

    // Node deposits currently enabled
    function getDepositEnabled() override public view returns (bool) {
        return getBoolS("settings.node.deposit.enabled");
    }
    function setDepositEnabled(bool _value) public onlyOwner {
        setBoolS("settings.node.deposit.enabled", _value);
    }

}
