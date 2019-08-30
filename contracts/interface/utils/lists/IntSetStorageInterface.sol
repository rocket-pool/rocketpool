pragma solidity 0.5.8; 

contract IntSetStorageInterface {
    function getCount(bytes32 _key) external view returns (uint);
    function getItem(bytes32 _key, uint _index) external view returns (int);
    function getIndexOf(bytes32 _key, int _value) external view returns (int);
    function addItem(bytes32 _key, int _value) external;
    function removeItem(bytes32 _key, int _value) external;
}
