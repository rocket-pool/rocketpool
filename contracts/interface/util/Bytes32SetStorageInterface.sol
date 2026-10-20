// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

interface Bytes32SetStorageInterface {
    function getCount(bytes32 _key) external view returns (uint256);
    function getItem(bytes32 _key, uint256 _index) external view returns (bytes32);
    function getIndexOf(bytes32 _key, bytes32 _value) external view returns (int256);
    function addItem(bytes32 _key, bytes32 _value) external;
    function removeItem(bytes32 _key, bytes32 _value) external;
}
