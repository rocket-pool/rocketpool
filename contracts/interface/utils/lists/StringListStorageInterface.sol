pragma solidity 0.5.0; 

contract StringListStorageInterface {
    function getListCount(bytes32 _key) external view returns (uint);
    function getListItem(bytes32 _key, uint _index) external view returns (string memory);
    function getListIndexOf(bytes32 _key, string calldata _value) external view returns (int);
    function setListItem(bytes32 _key, uint _index, string calldata _value) external;
    function pushListItem(bytes32 _key, string calldata _value) external;
    function insertListItem(bytes32 _key, uint _index, string calldata _value) external;
    function removeUnorderedListItem(bytes32 _key, uint _index) external;
    function removeOrderedListItem(bytes32 _key, uint _index) external;
}
