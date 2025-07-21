// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;
pragma abicoder v2;

import {RocketBase} from "../RocketBase.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketMinipoolInterface} from "../../interface/minipool/RocketMinipoolInterface.sol";
import {RocketMinipoolBondReducerInterface} from "../../interface/minipool/RocketMinipoolBondReducerInterface.sol";
import {RocketNodeDepositInterface} from "../../interface/node/RocketNodeDepositInterface.sol";
import {RocketDAONodeTrustedSettingsMinipoolInterface} from "../../interface/dao/node/settings/RocketDAONodeTrustedSettingsMinipoolInterface.sol";
import {RocketDAONodeTrustedInterface} from "../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import {RocketDAOProtocolSettingsRewardsInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsRewardsInterface.sol";
import {RocketDAOProtocolSettingsMinipoolInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import {RocketMinipoolManagerInterface} from "../../interface/minipool/RocketMinipoolManagerInterface.sol";

/// @notice Handles bond reduction window and trusted node cancellation
contract RocketMinipoolBondReducer is RocketBase, RocketMinipoolBondReducerInterface {
    // Events
    event CancelReductionVoted(address indexed minipool, address indexed member, uint256 time);
    event ReductionCancelled(address indexed minipool, uint256 time);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 2;
    }

    /// @notice Always reverts
    function beginReduceBondAmount(address _minipoolAddress, uint256 _newBondAmount) override external onlyLatestContract("rocketMinipoolBondReducer", address(this)) {
        revert("Minipool bond reductions are no longer available");
    }

    /// @notice Always reverts
    function reduceBondAmount() override external onlyRegisteredMinipool(msg.sender) onlyLatestContract("rocketMinipoolBondReducer", address(this)) returns (uint256) {
        revert("Minipool bond reductions are no longer available");
    }

    /// @notice Always reverts
    function voteCancelReduction(address _minipoolAddress) override external onlyTrustedNode(msg.sender) onlyLatestContract("rocketMinipoolBondReducer", address(this)) {
        revert("Minipool bond reductions are no longer available");
    }

    /// @notice Returns the timestamp of when a given minipool began their bond reduction waiting period
    /// @param _minipoolAddress Address of the minipool to query
    function getReduceBondTime(address _minipoolAddress) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("minipool.bond.reduction.time", _minipoolAddress)));
    }

    /// @notice Returns the new bond that a given minipool has indicated they are reducing to
    /// @param _minipoolAddress Address of the minipool to query
    function getReduceBondValue(address _minipoolAddress) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("minipool.bond.reduction.value", _minipoolAddress)));
    }

    /// @notice Returns true if the given minipool has had it's bond reduction cancelled by the oDAO
    /// @param _minipoolAddress Address of the minipool to query
    function getReduceBondCancelled(address _minipoolAddress) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked("minipool.bond.reduction.cancelled", address(_minipoolAddress))));
    }

    /// @notice Always returns false
    /// @param _minipoolAddress Address of the minipool
    function canReduceBondAmount(address _minipoolAddress) override public view returns (bool) {
        return false;
    }

    /// @notice Returns a timestamp of when the given minipool last performed a bond reduction
    /// @param _minipoolAddress The address of the minipool to query
    /// @return Unix timestamp of last bond reduction (or 0 if never reduced)
    function getLastBondReductionTime(address _minipoolAddress) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("minipool.last.bond.reduction.time", _minipoolAddress)));
    }

    /// @notice Returns the previous bond value of the given minipool on their last bond reduction
    /// @param _minipoolAddress The address of the minipool to query
    /// @return Previous bond value in wei (or 0 if never reduced)
    function getLastBondReductionPrevValue(address _minipoolAddress) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("minipool.last.bond.reduction.prev.value", _minipoolAddress)));
    }

    /// @notice Returns the previous node fee of the given minipool on their last bond reduction
    /// @param _minipoolAddress The address of the minipool to query
    /// @return Previous node fee
    function getLastBondReductionPrevNodeFee(address _minipoolAddress) override external view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("minipool.last.bond.reduction.prev.fee", _minipoolAddress)));
    }
}
