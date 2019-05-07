pragma solidity 0.5.8; 

contract Bytes32ListStorageInterface {
    function getListCount(bytes32 _key) external view returns (uint);
    function getListItem(bytes32 _key, uint _index) external view returns (bytes32);
    function getListIndexOf(bytes32 _key, bytes32 _value) external view returns (int);
    function setListItem(bytes32 _key, uint _index, bytes32 _value) external;
    function pushListItem(bytes32 _key, bytes32 _value) external;
    function insertListItem(bytes32 _key, uint _index, bytes32 _value) external;
    function removeUnorderedListItem(bytes32 _key, uint _index) external;
    function removeOrderedListItem(bytes32 _key, uint _index) external;
}
