pragma solidity 0.4.24; 

contract BytesSetStorageInterface {
    function getCount(bytes32 _key) external view returns (uint);
    function getItem(bytes32 _key, uint _index) external view returns (bytes);
    function getIndexOf(bytes32 _key, bytes _value) external view returns (int);
    function addItem(bytes32 _key, bytes _value) external;
    function removeItem(bytes32 _key, bytes _value) external;
}
