// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.7.6;

contract RocketStorageMockV07 {
    bool private deployed;
    mapping(bytes32 => address) private addresses;
    mapping(bytes32 => bool) private bools;
    mapping(bytes32 => uint256) private uints;

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
}
