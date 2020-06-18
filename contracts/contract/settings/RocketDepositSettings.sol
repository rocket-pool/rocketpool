pragma solidity 0.6.10;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/settings/RocketDepositSettingsInterface.sol";

// Network deposit settings

contract RocketDepositSettings is RocketBase, RocketDepositSettingsInterface {

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Set version
        version = 1;
        // Initialize settings on deployment
        if (!getBoolS("settings.deposit.init")) {
            // Apply settings
            setDepositEnabled(true);
            setAssignDepositsEnabled(true);
            setMinimumDeposit(0.01 ether);
            setMaximumDepositAssignments(2);
            // Settings initialized
            setBoolS("settings.deposit.init", true);
        }
    }

    // Deposits currently enabled
    function getDepositEnabled() override public view returns (bool) {
        return getBoolS("settings.deposit.enabled");
    }
    function setDepositEnabled(bool _value) public onlySuperUser {
        setBoolS("settings.deposit.enabled", _value);
    }

    // Deposit assignments currently enabled
    function getAssignDepositsEnabled() override public view returns (bool) {
        return getBoolS("settings.deposit.assign.enabled");
    }
    function setAssignDepositsEnabled(bool _value) public onlySuperUser {
        setBoolS("settings.deposit.assign.enabled", _value);
    }

    // Minimum deposit size
    function getMinimumDeposit() override public view returns (uint256) {
        return getUintS("settings.deposit.minimum");
    }
    function setMinimumDeposit(uint256 _value) public onlySuperUser {
        setUintS("settings.deposit.minimum", _value);
    }

    // The maximum number of deposit assignments to perform at once
    function getMaximumDepositAssignments() override public view returns (uint256) {
        return getUintS("settings.deposit.assign.maximum");
    }
    function setMaximumDepositAssignments(uint256 _value) public onlySuperUser {
        setUintS("settings.deposit.assign.maximum", _value);
    }

}
