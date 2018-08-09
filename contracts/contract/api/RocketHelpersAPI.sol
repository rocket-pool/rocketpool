pragma solidity 0.4.24;


import "../../RocketBase.sol";

/// @title RocketHelpersAPI - Helper methods for the API
/// @author David Rugendyke

contract RocketHelpersAPI is RocketBase {


    /*** Contracts **************/

    /*** Modifiers *************/

    /*** Constructor *************/
   
    /// @dev constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }

     /*** Getters *************/

    /// @dev Get the API deposit address - should be called before any deposit
    function getDepositAddress() public returns(address) { 
        // Get the current deposit address 
        rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketDepositAPI")));
    }

    /// @dev Get the API withdrawal address - should be called before any withdrawal
    function getWithdrawalAddress() public returns(address) { 
        // Get the current withdrawal address 
        rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketWithdrawalAPI")));
    }


}
