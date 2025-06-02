// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";

/// @dev NOT USED IN PRODUCTION - Helper contract used to perform manual edits to storage
contract StorageHelper {

    RocketStorageInterface immutable public rocketStorage;

    modifier onlyGuardian() {
        require(msg.sender == rocketStorage.getGuardian(), "Account is not a temporary guardian");
        _;
    }

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) {
        rocketStorage = _rocketStorageAddress;
    }

    function getAddress(bytes32 _key) external view returns (address) {
        return rocketStorage.getAddress(_key);
    }

    function getUint(bytes32 _key) external view returns (uint) {
        return rocketStorage.getUint(_key);
    }

    function getString(bytes32 _key) external view returns (string memory) {
        return rocketStorage.getString(_key);
    }

    function getBytes(bytes32 _key) external view returns (bytes memory) {
        return rocketStorage.getBytes(_key);
    }

    function getBool(bytes32 _key) external view returns (bool) {
        return rocketStorage.getBool(_key);
    }

    function getInt(bytes32 _key) external view returns (int) {
        return rocketStorage.getInt(_key);
    }

    function getBytes32(bytes32 _key) external view returns (bytes32) {
        return rocketStorage.getBytes32(_key);
    }

    function setAddress(bytes32 _key, address _value) external onlyGuardian {
        rocketStorage.setAddress(_key, _value);
    }

    function setUint(bytes32 _key, uint _value) external onlyGuardian {
        rocketStorage.setUint(_key, _value);
    }

    function setString(bytes32 _key, string memory _value) external onlyGuardian {
        rocketStorage.setString(_key, _value);
    }

    function setBytes(bytes32 _key, bytes memory _value) external onlyGuardian {
        rocketStorage.setBytes(_key, _value);
    }

    function setBool(bytes32 _key, bool _value) external onlyGuardian {
        rocketStorage.setBool(_key, _value);
    }

    function setInt(bytes32 _key, int _value) external onlyGuardian {
        rocketStorage.setInt(_key, _value);
    }

    function setBytes32(bytes32 _key, bytes32 _value) external onlyGuardian {
        rocketStorage.setBytes32(_key, _value);
    }

    /// @dev Storage delete methods
    function deleteAddress(bytes32 _key) external onlyGuardian {
        rocketStorage.deleteAddress(_key);
    }

    function deleteUint(bytes32 _key) external onlyGuardian {
        rocketStorage.deleteUint(_key);
    }

    function deleteString(bytes32 _key) external onlyGuardian {
        rocketStorage.deleteString(_key);
    }

    function deleteBytes(bytes32 _key) external onlyGuardian {
        rocketStorage.deleteBytes(_key);
    }

    function deleteBool(bytes32 _key) external onlyGuardian {
        rocketStorage.deleteBool(_key);
    }

    function deleteInt(bytes32 _key) external onlyGuardian {
        rocketStorage.deleteInt(_key);
    }

    function deleteBytes32(bytes32 _key) external onlyGuardian {
        rocketStorage.deleteBytes32(_key);
    }

    function addUint(bytes32 _key, uint256 _amount) external onlyGuardian {
        rocketStorage.addUint(_key, _amount);
    }

    function subUint(bytes32 _key, uint256 _amount) external onlyGuardian {
        rocketStorage.subUint(_key, _amount);
    }
}