// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.7.6;

import "../../../../../contract/dao/protocol/settings/RocketDAOProtocolSettings.sol";
import "../../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsDepositInterface.sol";


/// @notice Network deposit settings
contract RocketDAOProtocolSettingsDepositOld is RocketDAOProtocolSettings, RocketDAOProtocolSettingsDepositInterface {

    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "deposit") {
        // Set version
        version = 3;
        // Initialize settings on deployment
        if(!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // Apply settings
            setSettingBool("deposit.enabled", false);
            setSettingBool("deposit.assign.enabled", true);
            setSettingUint("deposit.minimum", 0.01 ether);
            setSettingUint("deposit.pool.maximum", 160 ether);
            setSettingUint("deposit.assign.maximum", 90);
            setSettingUint("deposit.assign.socialised.maximum", 2);
            setSettingUint("deposit.fee", 0.0005 ether);    // Set to approx. 1 day of rewards at 18.25% APR
            // Settings initialised
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
        }
    }

    /// @notice Returns true if deposits are currently enabled
    function getDepositEnabled() override external view returns (bool) {
        return getSettingBool("deposit.enabled");
    }

    /// @notice Returns true if deposit assignments are currently enabled
    function getAssignDepositsEnabled() override external view returns (bool) {
        return getSettingBool("deposit.assign.enabled");
    }

    /// @notice Returns the minimum deposit size
    function getMinimumDeposit() override external view returns (uint256) {
        return getSettingUint("deposit.minimum");
    }

    /// @notice Returns the maximum size of the deposit pool
    function getMaximumDepositPoolSize() override external view returns (uint256) {
        return getSettingUint("deposit.pool.maximum");
    }

    /// @notice Returns the maximum number of deposit assignments to perform at once
    function getMaximumDepositAssignments() override external view returns (uint256) {
        return getSettingUint("deposit.assign.maximum");
    }

    /// @notice Returns the maximum number of socialised (ie, not related to deposit size) assignments to perform
    function getMaximumDepositSocialisedAssignments() override external view returns (uint256) {
        return getSettingUint("deposit.assign.socialised.maximum");
    }

    /// @notice Returns the current fee paid on user deposits
    function getDepositFee() override external view returns (uint256) {
        return getSettingUint("deposit.fee");
    }

}