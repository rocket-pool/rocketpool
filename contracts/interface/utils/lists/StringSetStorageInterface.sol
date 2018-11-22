pragma solidity 0.5.0; 

contract StringSetStorageInterface {
    function getCount(bytes32 _key) external view returns (uint);
    function getItem(bytes32 _key, uint _index) external view returns (string memory);
    function getIndexOf(bytes32 _key, string memory _value) public view returns (int);
    function addItem(bytes32 _key, string memory _value) public;
    function removeItem(bytes32 _key, string memory _value) public;
}
