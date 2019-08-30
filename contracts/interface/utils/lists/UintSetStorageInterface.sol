pragma solidity 0.5.8; 

contract UintSetStorageInterface {
    function getCount(bytes32 _key) external view returns (uint);
    function getItem(bytes32 _key, uint _index) external view returns (uint);
    function getIndexOf(bytes32 _key, uint _value) external view returns (int);
    function addItem(bytes32 _key, uint _value) external;
    function removeItem(bytes32 _key, uint _value) external;
}
