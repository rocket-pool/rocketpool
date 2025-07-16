// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketStorageInterface} from "../../../../interface/RocketStorageInterface.sol";
import {RocketDAOProtocolSettingsMegapoolInterface} from "../../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMegapoolInterface.sol";
import {RocketBase} from "../../../RocketBase.sol";
import {RocketDAOProtocolSettings} from "./RocketDAOProtocolSettings.sol";

/// @notice Network megapool settings
contract RocketDAOProtocolSettingsMegapool is RocketDAOProtocolSettings, RocketDAOProtocolSettingsMegapoolInterface {
    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAOProtocolSettings(_rocketStorageAddress, "megapool") {
        version = 1;
        // Initialise settings on deployment
        if (!rocketStorage.getDeployedStatus()) {
            initialise();
        }
    }

    /// @notice Called during deployment or upgrade to set initial values for settings
    function initialise() override public {
        // Set defaults
        _setSettingUint("megapool.time.before.dissolve", 28 days);               // Time that must be waited before dissolving a megapool validator (RPIP-59)
        _setSettingUint("maximum.megapool.eth.penalty", 612 ether);              // Maximum ETH penalty that can be applied over a rolling 50400 block window (RPIP-42)
        _setSettingUint("notify.threshold", 12 hours);                           // Time before withdrawable_epoch a node operator must notify exit (RPIP-72)
        _setSettingUint("late.notify.fine", 0.05 ether);                         // Fine applied to node operator for not notifying exit in time (RPIP-72)
        _setSettingUint("user.distribute.window.length", 7 days);                // How long a user must wait before distributing someone else's megapool (RPIP-72)
        // Update deploy flag
        require (!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed"))), "Already initialised");
        setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
    }

    /// @notice Update a setting, overrides inherited setting method with extra checks for this contract
    /// @param _settingPath The path of the setting within this contract's namespace
    /// @param _value The value to set it to
    function setSettingUint(string memory _settingPath, uint256 _value) override public onlyDAOProtocolProposal {
        if(getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // Some safety guards for certain settings
            bytes32 settingKey = keccak256(abi.encodePacked(_settingPath));
            if (settingKey == keccak256(abi.encodePacked("megapool.time.before.dissolve"))) {
                require(_value >= 2 days, "Value must be greater or equal to 2 days");                  // Per RPIP-59
            } else if (settingKey == keccak256(abi.encodePacked("maximum.megapool.eth.penalty"))) {
                require(_value >= 300 ether, "Maximum penalty must equal or exceed 300 ETH");           // Per RPIP-42
            } else if (settingKey == keccak256(abi.encodePacked("notify.threshold"))) {
                require(_value >= 2 hours, "Notify threshold must be greater or equal to 2 hours");     // Per RPIP-72
            } else if (settingKey == keccak256(abi.encodePacked("late.notify.fine"))) {
                require(_value < 0.5 ether, "Fine must be less than or equal to 0.5 ETH");              // Per RPIP-72
            } else if (settingKey == keccak256(abi.encodePacked("user.distribute.window.length"))) {
                require(_value >= 1 days && _value <= 30 days, "Value must be between 1 and 30 days");  // Per RPIP-72
            }
        }
        // Update setting now
        _setSettingUint(_settingPath, _value);
    }

    /// @dev Directly updates a setting, no guardrails applied
    function _setSettingUint(string memory _settingPath, uint256 _value) internal {
        setUint(keccak256(abi.encodePacked(settingNameSpace, _settingPath)), _value);
    }

    /// @notice Returns how long after an assignment a watcher must wait to dissolve a megapool validator (seconds)
    function getTimeBeforeDissolve() override external view returns (uint256) {
        return getSettingUint("megapool.time.before.dissolve");
    }

    /// @notice Returns the maximum amount a megapool can be penalised in 50,400 consecutive slots (~7 days)
    function getMaximumEthPenalty() override external view returns (uint256) {
        return getSettingUint("maximum.megapool.eth.penalty");
    }

    /// @notice Returns the amount of time before `withdrawable_epoch` a node operator must notify their exit
    function getNotifyThreshold() override external view returns (uint256) {
        return getSettingUint("notify.threshold");
    }

    /// @notice Returns the amount a node operator is fined for notifying their exit late
    function getLateNotifyFine() override external view returns (uint256) {
        return getSettingUint("late.notify.fine");
    }

    /// @notice Returns the amount of time a user must wait before distributing another node's megapool
    function getUserDistributeWindowLength() override external view returns (uint256) {
        return getSettingUint("user.distribute.window.length");
    }
}
