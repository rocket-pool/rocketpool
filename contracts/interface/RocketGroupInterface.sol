pragma solidity 0.4.24; 


// Our group interface
contract RocketGroupInterface {
    // Getters
    function getGroupName(address _ID) public view returns(string);
    function getGroupAccessAddress(address _ID) public view returns(address);
}