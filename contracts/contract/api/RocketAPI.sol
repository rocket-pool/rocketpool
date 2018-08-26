pragma solidity 0.4.24;


import "../../RocketBase.sol";

/// @title RocketAPI - The main portal contract for the API, should be kept very simple
/// @author David Rugendyke

contract RocketAPI is RocketBase {

    /*** Constructor *************/
   
    /// @dev constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }


    /*** Getters *************/

    /// @dev Get the the API contracts address - This method should be called before interacting with any API contracts to ensure the latest address is used
    function getAPIContractAddress(string _contractName) public view returns(address) { 
        // Get the current API contract address 
        address contractAddress = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", _contractName)));
        // Check it
        require(address(contractAddress) != address(0x0), "Rocket Pool API - Contract not found.");
        // Done
        return contractAddress;
    }

}
