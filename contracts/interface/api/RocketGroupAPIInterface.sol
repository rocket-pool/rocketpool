pragma solidity 0.5.0; 


// Our group interface
contract RocketGroupAPIInterface {
    // Getters
    function getGroupName(address _ID) public view returns (string memory);
    function getGroupAccessAddress(address _ID) public view returns(address);
}