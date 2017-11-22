pragma solidity ^0.4.17;

import "./contract/Owned.sol";
import "./RocketStorage.sol";


/// @title Upgrades for Rocket Pool network contracts
/// @author David Rugendyke

contract RocketUpgrade is Owned {


    /**** Properties ***********/

    address private rocketStorageAddress;                  // Address of the main RocketStorage contract

    
    /*** Contracts **************/

    RocketStorage rocketStorage = RocketStorage(0);        // The main RocketStorage contract where primary persistant storage is maintained


    /*** Constructor ***********/    

    /// @dev RocketUpgrade constructor
    function RocketUpgrade(address _rocketStorageAddress) public {
        // Address of the main RocketStorage contract, should never need updating
        rocketStorageAddress = _rocketStorageAddress;
        // Update the contract address
        rocketStorage = RocketStorage(rocketStorageAddress);
    }


    /**** Contract Upgrade Methods ***********/

    /// @param _name The name of an existing contract in the network
    /// @param _upgradedContractAddress The new contracts address that will replace the current one
    // TODO: Write unit test to verify
    function upgradeContract(bytes32 _name, address _upgradedContractAddress) onlyOwner external {
        // Get the current contracts address
        address oldContractAddress = rocketStorage.getAddress(keccak256("rocketContract", _name));
        // Check it exists
        require(oldContractAddress != 0x0);
        // Replace the address for the name lookup - contract addresses can be looked up by their name or verified by a reverse address lookup
        rocketStorage.setAddress(keccak256("contract.name", _name), _upgradedContractAddress);
        // Add the new contract address for a direct verification using the address (used in RocketStorage to verify its a legit contract using only the msg.sender)
        rocketStorage.setAddress(keccak256("contract.address", _upgradedContractAddress), _upgradedContractAddress);
        // Remove the old contract address verification
        rocketStorage.deleteAddress(keccak256("contract.address", oldContractAddress));
    }
    

}
