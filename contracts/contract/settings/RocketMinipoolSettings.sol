pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../lib/SafeMath.sol";

// Network minipool settings

contract RocketMinipoolSettings is RocketBase, RocketMinipoolSettingsInterface {

    // Libs
    using SafeMath for uint;

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Set version
        version = 1;
        // Initialize settings on deployment
        if (!getBoolS("settings.minipool.init")) {
            // Apply settings
            setLaunchBalance(32 ether);
            // Settings initialized
            setBoolS("settings.minipool.init", true);
        }
    }

    // Balance required to launch minipool
    function getLaunchBalance() override public view returns (uint256) {
        return getUintS("settings.minipool.launch.balance");
    }
    function setLaunchBalance(uint256 _value) public onlySuperUser {
        setUintS("settings.minipool.launch.balance", _value);
    }

    // Required node deposit amounts
    function getActivePoolNodeDeposit() override public view returns (uint256) {
        return getLaunchBalance();
    }
    function getIdlePoolNodeDeposit() override public view returns (uint256) {
        return getLaunchBalance().div(2);
    }
    function getEmptyPoolNodeDeposit() override public view returns (uint256) {
        return 0;
    }

}
