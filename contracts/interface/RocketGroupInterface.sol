pragma solidity 0.4.24; 


// Our group interface
contract RocketGroupInterface {
    // Getters
    function getGroupName(string _groupID) public view returns(string);
    function getGroupAddress(string _groupID) public view returns(address);
}