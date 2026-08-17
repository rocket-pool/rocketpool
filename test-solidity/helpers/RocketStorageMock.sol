// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

contract RocketStorageMock {
    bool private deployed;
    mapping(bytes32 => address) private addresses;
    mapping(bytes32 => bool) private bools;
    mapping(bytes32 => uint256) private uints;
    mapping(bytes32 => bytes32) private bytes32s;

    function setDeployedStatus(bool _deployed) external {
        deployed = _deployed;
    }

    function getDeployedStatus() external view returns (bool) {
        return deployed;
    }

    function getAddress(bytes32 _key) external view returns (address) {
        return addresses[_key];
    }

    function setAddress(bytes32 _key, address _value) external {
        addresses[_key] = _value;
    }

    function getBool(bytes32 _key) external view returns (bool) {
        return bools[_key];
    }

    function setBool(bytes32 _key, bool _value) external {
        bools[_key] = _value;
    }

    function getUint(bytes32 _key) external view returns (uint256) {
        return uints[_key];
    }

    function setUint(bytes32 _key, uint256 _value) external {
        uints[_key] = _value;
    }

    function deleteUint(bytes32 _key) external {
        delete uints[_key];
    }

    function getBytes32(bytes32 _key) external view returns (bytes32) {
        return bytes32s[_key];
    }

    function setBytes32(bytes32 _key, bytes32 _value) external {
        bytes32s[_key] = _value;
    }
}
