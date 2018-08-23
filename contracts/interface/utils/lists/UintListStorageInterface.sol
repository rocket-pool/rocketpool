pragma solidity 0.4.24; 

contract UintListStorageInterface {
    function getListCount(bytes32 _key) external view returns (uint);
    function getListItem(bytes32 _key, uint _index) external view returns (uint);
    function getListIndexOf(bytes32 _key, uint _value) external view returns (int);
    function setListItem(bytes32 _key, uint _index, uint _value) external;
    function pushListItem(bytes32 _key, uint _value) external;
    function insertListItem(bytes32 _key, uint _index, uint _value) external;
    function removeUnorderedListItem(bytes32 _key, uint _index) external;
    function removeOrderedListItem(bytes32 _key, uint _index) external;
}
