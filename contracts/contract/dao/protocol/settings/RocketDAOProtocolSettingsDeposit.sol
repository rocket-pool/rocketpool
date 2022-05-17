pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "./RocketDAOProtocolSettings.sol";
import "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsDepositInterface.sol";
 
// Network deposit settings

contract RocketDAOProtocolSettingsDeposit is RocketDAOProtocolSettings, RocketDAOProtocolSettingsDepositInterface {

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "deposit") {
        // Set version
        version = 2;
        // Initialize settings on deployment
        if(!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // Apply settings
            setSettingBool("deposit.enabled", false);
            setSettingBool("deposit.assign.enabled", true);
            setSettingUint("deposit.minimum", 0.01 ether);
            setSettingUint("deposit.pool.maximum", 160 ether);
            setSettingUint("deposit.assign.maximum", 2);
            setSettingUint("deposit.fee", 0.0005 ether);    // Set to approx. 1 day of rewards at 18.25% APR
            // Settings initialised
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
        }
    }

    // Deposits currently enabled
    function getDepositEnabled() override external view returns (bool) {
        return getSettingBool("deposit.enabled");
    }

    // Deposit assignments currently enabled
    function getAssignDepositsEnabled() override external view returns (bool) {
        return getSettingBool("deposit.assign.enabled");
    }

    // Minimum deposit size
    function getMinimumDeposit() override external view returns (uint256) {
        return getSettingUint("deposit.minimum");
    }

    // The maximum size of the deposit pool
    function getMaximumDepositPoolSize() override external view returns (uint256) {
        return getSettingUint("deposit.pool.maximum");
    }

    // The maximum number of deposit assignments to perform at once
    function getMaximumDepositAssignments() override external view returns (uint256) {
        return getSettingUint("deposit.assign.maximum");
    }

    // Get the fee paid on deposits
    function getDepositFee() override external view returns (uint256) {
        return getSettingUint("deposit.fee");
    }
}
