pragma solidity 0.5.0; 

contract Bytes32SetStorageInterface {
    function getCount(bytes32 _key) external view returns (uint);
    function getItem(bytes32 _key, uint _index) external view returns (bytes32);
    function getIndexOf(bytes32 _key, bytes32 _value) external view returns (int);
    function addItem(bytes32 _key, bytes32 _value) external;
    function removeItem(bytes32 _key, bytes32 _value) external;
}
