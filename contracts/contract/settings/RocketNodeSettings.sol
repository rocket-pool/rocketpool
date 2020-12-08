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
            setMinimumPerMinipoolStake(0.1 ether); // 10% of user ETH value
            setMaximumPerMinipoolStake(1.5 ether); // 150% of user ETH value
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

    // Minimum RPL stake per minipool as a fraction of assigned user ETH value
    function getMinimumPerMinipoolStake() override public view returns (uint256) {
        return getUintS("settings.node.per.minipool.stake.minimum");
    }
    function setMinimumPerMinipoolStake(uint256 _value) public onlyOwner {
        setUintS("settings.node.per.minipool.stake.minimum", _value);
    }

    // Maximum RPL stake per minipool as a fraction of assigned user ETH value
    function getMaximumPerMinipoolStake() override public view returns (uint256) {
        return getUintS("settings.node.per.minipool.stake.maximum");
    }
    function setMaximumPerMinipoolStake(uint256 _value) public onlyOwner {
        setUintS("settings.node.per.minipool.stake.maximum", _value);
    }

}
