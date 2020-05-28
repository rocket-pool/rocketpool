pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";

// Network deposit settings

contract RocketDepositSettings is RocketBase {

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
            setMinimumDepositFee(0.001 ether); // 10 basis points
            setMaximumDepositFee(0.005 ether); // 50 basis points
            setNodeDemandFeeRange(1000 ether);
            // Settings initialized
            setBoolS("settings.deposit.init", true);
        }
    }

    // Deposits currently enabled
    function getDepositEnabled() public view returns (bool) {
        return getBoolS("settings.deposit.enabled");
    }
    function setDepositEnabled(bool _value) public onlySuperUser {
        setBoolS("settings.deposit.enabled", _value);
    }

    // Deposit assignments currently enabled
    function getAssignDepositsEnabled() public view returns (bool) {
        return getBoolS("settings.deposit.assign.enabled");
    }
    function setAssignDepositsEnabled(bool _value) public onlySuperUser {
        setBoolS("settings.deposit.assign.enabled", _value);
    }

    // Minimum deposit size
    function getMinimumDeposit() public view returns (uint256) {
        return getUintS("settings.deposit.minimum");
    }
    function setMinimumDeposit(uint256 _value) public onlySuperUser {
        setUintS("settings.deposit.minimum", _value);
    }

    // The minimum network deposit fee as a fraction of 1 ETH
    function getMinimumDepositFee() public view returns (uint256) {
        return getUintS("settings.deposit.fee.minimum");
    }
    function setMinimumDepositFee(uint256 _value) public onlySuperUser {
        setUintS("settings.deposit.fee.minimum", _value);
    }

    // The maximum network deposit fee as a fraction of 1 ETH
    function getMaximumDepositFee() public view returns (uint256) {
        return getUintS("settings.deposit.fee.maximum");
    }
    function setMaximumDepositFee(uint256 _value) public onlySuperUser {
        setUintS("settings.deposit.fee.maximum", _value);
    }

    // The node demand range to scale the deposit fee by
    // The deposit fee is scaled based on a range of -1 to +1 multiplied by this value
    function getNodeDemandFeeRange() public view returns (uint256) {
        return getUintS("settings.deposit.fee.range");
    }
    function setNodeDemandFeeRange(uint256 _value) public onlySuperUser {
        setUintS("settings.deposit.fee.range", _value);
    }

}
