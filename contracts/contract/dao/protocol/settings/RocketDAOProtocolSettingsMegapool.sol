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
        _setSettingUint("megapool.dissolve.penalty", 0.05 ether);                // The penalty which is applied to node operators when one of their validators gets dissolved
        _setSettingUint("maximum.megapool.eth.penalty", 612 ether);              // Maximum ETH penalty that can be applied over a rolling 7-day window (RPIP-42)
        _setSettingUint("notify.threshold", 112);                                // Number of epochs before withdrawable_epoch a node operator must notify exit (RPIP-72)
        _setSettingUint("late.notify.fine", 0.05 ether);                         // Fine applied to node operator for not notifying exit in time (RPIP-72)
        _setSettingUint("user.distribute.delay", 1575);                          // How many epochs a user must wait before distributing someone else's megapool (RPIP-72)
        _setSettingUint("user.distribute.delay.shortfall", 6750);                // How many epochs a user must wait before distributing someone else's megapool with a shortfall of user funds
        _setSettingUint("megapool.penalty.threshold", 0.51 ether);               // Percentage of trusted members that must vote in favour of a penalty
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
            if (settingKey == keccak256(bytes("megapool.time.before.dissolve"))) {
                require(_value >= 10 days && _value <= 60 days, "Value must be >= 10 days & <= 60 days");
            } else if (settingKey == keccak256(bytes("maximum.megapool.eth.penalty"))) {
                require(_value >= 300 ether && _value <= 5000 ether, "Value must be >= 300 ETH & <= 5000 ETH");
            } else if (settingKey == keccak256(bytes("notify.threshold"))) {
                require(_value >= 19 && _value <= 456, "Value must be >= 19 epochs & <= 456 epochs");
            } else if (settingKey == keccak256(bytes("late.notify.fine"))) {
                require(_value >= 0.01 ether && _value <= 0.5 ether, "Value must be >= 0.01 ETH & <= 0.5 ETH");
            } else if (settingKey == keccak256(bytes("user.distribute.delay"))) {
                require(_value >= 225 && _value <= 13500, "Value must be >= 225 & <= 13500 epochs");
            } else if (settingKey == keccak256(bytes("user.distribute.delay.shortfall"))) {
                require(_value >= 6750 && _value <= 40500, "Value must be >= 6750 & <= 40500 epochs");
            } else if (settingKey == keccak256(bytes("megapool.penalty.threshold"))) {
                require(_value >= 0.51 ether, "Penalty threshold must be 51% or higher");
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

    /// @notice Returns the penalty applied to a NO for having a validator dissolved
    function getDissolvePenalty() override external view returns (uint256) {
        return getSettingUint("megapool.dissolve.penalty");
    }

    /// @notice Returns the maximum amount megapools can be penalised in a 7 day rolling window
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

    /// @notice Returns the number of epochs a user must wait before distributing another node's megapool
    function getUserDistributeDelay() override external view returns (uint256) {
        return getSettingUint("user.distribute.delay");
    }

    /// @notice Returns the number of epochs a user must wait before distributing another node's megapool if the distribute results in a shortfall of user funds
    function getUserDistributeDelayWithShortfall() override external view returns (uint256) {
        return getSettingUint("user.distribute.delay.shortfall");
    }

    /// @notice Returns the percentage of trusted members that must vote in favour of a penalty
    function getPenaltyThreshold() override external view returns (uint256) {
        return getSettingUint("megapool.penalty.threshold");
    }
}
