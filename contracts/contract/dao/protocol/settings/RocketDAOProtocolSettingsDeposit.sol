// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketStorageInterface} from "../../../../interface/RocketStorageInterface.sol";
import {RocketDAOProtocolSettingsDepositInterface} from "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsDepositInterface.sol";
import {RocketBase} from "../../../RocketBase.sol";
import {RocketDAOProtocolSettings} from "./RocketDAOProtocolSettings.sol";

/// @notice Network deposit settings
contract RocketDAOProtocolSettingsDeposit is RocketDAOProtocolSettings, RocketDAOProtocolSettingsDepositInterface {
    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "deposit") {
        version = 5;
        // Initialise settings on deployment
        if (!rocketStorage.getDeployedStatus()) {
            // Set defaults
            setSettingBool("deposit.enabled", false);
            setSettingBool("deposit.assign.enabled", true);
            _setSettingUint("deposit.minimum", 0.01 ether);
            _setSettingUint("deposit.pool.maximum", 160 ether);
            _setSettingUint("deposit.assign.maximum", 90);
            _setSettingUint("deposit.assign.socialised.maximum", 0);
            _setSettingUint("deposit.fee", 0.0005 ether);                // Set to approx. 1 day of rewards at 18.25% APR
            _setSettingUint("express.queue.rate", 2);                    // RPIP-59
            _setSettingUint("express.queue.tickets.base.provision", 2);  // RPIP-59
            // Set deploy flag
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
        }
    }

    /// @notice Update a setting, overrides inherited setting method with extra checks for this contract
    /// @param _settingPath The path of the setting within this contract's namespace
    /// @param _value The value to set it to
    function setSettingUint(string memory _settingPath, uint256 _value) override public onlyDAOProtocolProposal {
        // Some safety guards for certain settings
        if(getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            bytes32 settingKey = keccak256(bytes(_settingPath));
            if (settingKey == keccak256(abi.encodePacked("deposit.fee"))) {
                require(_value < 0.01 ether, "Fee must be less than 1%");
            } else if (settingKey == keccak256(abi.encodePacked("express.queue.rate"))) {
                require(_value > 0, "Rate must be greater than 0");
            }
        }
        // Update setting now
        _setSettingUint(_settingPath, _value);
    }

    /// @dev Directly updates a setting, no guardrails applied
    function _setSettingUint(string memory _settingPath, uint256 _value) internal {
        setUint(keccak256(abi.encodePacked(settingNameSpace, _settingPath)), _value);
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

    /// @notice Returns the rate at which the express queue processes over the normal queue
    function getExpressQueueRate() override external view returns (uint256) {
        return getSettingUint("express.queue.rate");
    }

    /// @notice Returns the number of express queue tickets a new node operator receives
    function getExpressQueueTicketsBaseProvision() override external view returns (uint256) {
        return getSettingUint("express.queue.tickets.base.provision");
    }
}

