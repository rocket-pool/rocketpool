// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

import "./RocketMegapoolStorageLayout.sol";
import "./RocketMegapoolStorageLayout.sol";
import {RocketBase} from "../RocketBase.sol";
import {RocketMegapoolInterface} from "../../interface/megapool/RocketMegapoolInterface.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketMegapoolManagerInterface} from "../../interface/megapool/RocketMegapoolManagerInterface.sol";

/// @notice Manages the global list of validators across all megapools
contract RocketMegapoolManager is RocketBase, RocketMegapoolManagerInterface {

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    /// @notice Returns the total number validators across all megapools
    function getValidatorCount() override external view returns (uint256) {
        return getUint(keccak256("megapool.validator.set.count"));
    }

    /// @notice Adds a validator record to the global megapool validator set
    /// @param _megapoolAddress Address of the megapool which manages this validator
    /// @param _validatorId Internal validator ID of the new validator
    function addValidator(address _megapoolAddress, uint32 _validatorId) override external onlyLatestContract("rocketMegapoolManager", address(this)) onlyLatestContract("rocketNodeDeposit", msg.sender) {
        uint256 index = getUint(keccak256("megapool.validator.set.count"));
        setUint(keccak256("megapool.validator.set.count"), index + 1);
        uint256 encoded = (uint256(uint160(_megapoolAddress)) << 96) | uint32(_validatorId);
        setUint(keccak256(abi.encodePacked("megapool.validator.set", index)), encoded);
    }

    /// @notice Returns validator info for the given global megapool validator index
    /// @param _index The index of the validator to query
    function getValidatorInfo(uint256 _index) override external view returns (RocketMegapoolStorageLayout.ValidatorInfo memory, address, uint32) {
        uint256 encoded = getUint(keccak256(abi.encodePacked("megapool.validator.set", _index)));
        address megapoolAddress = address(uint160(encoded >> 96));
        uint32 validatorId = uint32(encoded);

        RocketMegapoolInterface rocketMegapool = RocketMegapoolInterface(megapoolAddress);
        return (rocketMegapool.getValidatorInfo(validatorId), megapoolAddress, validatorId);
    }
}
