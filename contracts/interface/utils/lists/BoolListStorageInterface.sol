pragma solidity 0.5.8; 

contract BoolListStorageInterface {
    function getListCount(bytes32 _key) external view returns (uint);
    function getListItem(bytes32 _key, uint _index) external view returns (bool);
    function getListIndexOf(bytes32 _key, bool _value) external view returns (int);
    function setListItem(bytes32 _key, uint _index, bool _value) external;
    function pushListItem(bytes32 _key, bool _value) external;
    function insertListItem(bytes32 _key, uint _index, bool _value) external;
    function removeUnorderedListItem(bytes32 _key, uint _index) external;
    function removeOrderedListItem(bytes32 _key, uint _index) external;
}
