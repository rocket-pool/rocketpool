pragma solidity 0.6.10;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/settings/RocketNetworkSettingsInterface.sol";

// Network settings

contract RocketNetworkSettings is RocketBase, RocketNetworkSettingsInterface {

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Set version
        version = 1;
        // Initialize settings on deployment
        if (!getBoolS("settings.network.init")) {
            // Apply settings
            setTargetRethCollateralRate(0.1 ether);
            // Settings initialized
            setBoolS("settings.network.init", true);
        }
    }

    // Target rETH collateralization rate as a fraction of 1 ether
    function getTargetRethCollateralRate() override public view returns (uint256) {
        return getUintS("settings.network.reth.collateral.target");
    }
    function setTargetRethCollateralRate(uint256 _value) public onlySuperUser {
        setUintS("settings.network.reth.collateral.target", _value);
    }

}
