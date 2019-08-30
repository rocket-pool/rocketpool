pragma solidity 0.5.8; 

contract StringListStorageInterface {
    function getListCount(bytes32 _key) external view returns (uint);
    function getListItem(bytes32 _key, uint _index) external view returns (string memory);
    function getListIndexOf(bytes32 _key, string memory _value) public view returns (int);
    function setListItem(bytes32 _key, uint _index, string memory _value) public;
    function pushListItem(bytes32 _key, string memory _value) public;
    function insertListItem(bytes32 _key, uint _index, string memory _value) public;
    function removeUnorderedListItem(bytes32 _key, uint _index) external;
    function removeOrderedListItem(bytes32 _key, uint _index) external;
}
