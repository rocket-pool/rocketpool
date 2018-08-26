pragma solidity 0.4.24;


// Our Rocket API interface
contract RocketAPIInterface {
    // Get the the API contracts address - This method should be called before interacting with any API contracts to ensure the latest address is used
    function getAPIContractAddress(string _contractName) public view returns(address);
}
