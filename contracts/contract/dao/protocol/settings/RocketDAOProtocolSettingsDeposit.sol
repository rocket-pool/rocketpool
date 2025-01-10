// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

import "./RocketDAOProtocolSettings.sol";
import "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsDepositInterface.sol";

/// @notice Network deposit settings
contract RocketDAOProtocolSettingsDeposit is RocketDAOProtocolSettings, RocketDAOProtocolSettingsDepositInterface {

    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "deposit") {
        version = 4;
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
            setSettingUint("deposit.express.queue.rate", 2);
            setSettingUint("deposit.express.queue.tickets.base.provision", 2);
            // Settings initialised
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
        }
    }

    /// @notice Update a setting, overrides inherited setting method with extra checks for this contract
    /// @param _settingPath The path of the setting within this contract's namespace
    /// @param _value The value to set it to
    function setSettingUint(string memory _settingPath, uint256 _value) override public onlyDAOProtocolProposal {
        // Some safety guards for certain settings
        if(getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            if(keccak256(abi.encodePacked(_settingPath)) == keccak256(abi.encodePacked("deposit.fee"))) {
                require(_value < 0.01 ether, "Fee must be less than 1%");
            }
        }
        // Update setting now
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

    /// @notice Returns the rate at which the deposit queue is processed
    function getDepositQueueRate() override external view returns (uint256) {
        return getSettingUint("deposit.express.queue.rate");
    }

    /// @notice Returns the number of express tickets provisioned 
    function getDepositQueueTicketsBaseProvision() override external view returns (uint256) {
        return getSettingUint("deposit.express.queue.tickets.base.provision");
    }

}
