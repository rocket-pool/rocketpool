pragma solidity 0.5.0; 

contract AddressListStorageInterface {
    function getListCount(bytes32 _key) external view returns (uint);
    function getListItem(bytes32 _key, uint _index) external view returns (address);
    function getListIndexOf(bytes32 _key, address _value) external view returns (int);
    function setListItem(bytes32 _key, uint _index, address _value) external;
    function pushListItem(bytes32 _key, address _value) external;
    function insertListItem(bytes32 _key, uint _index, address _value) external;
    function removeUnorderedListItem(bytes32 _key, uint _index) external;
    function removeOrderedListItem(bytes32 _key, uint _index) external;
}
