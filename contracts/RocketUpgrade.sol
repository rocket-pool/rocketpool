pragma solidity 0.4.19;


import "./RocketBase.sol";
import "./RocketStorage.sol";


/// @title Upgrades for Rocket Pool network contracts
/// @author David Rugendyke
contract RocketUpgrade is RocketBase {


     /*** Events ****************/

    event ContractUpgraded (
        address indexed _oldContractAddress,                    // Address of the contract being upgraded
        address indexed _newContractAddress,                    // Address of the new contract
        uint256 created                                         // Creation timestamp
    );


    /*** Constructor ***********/    

    /// @dev RocketUpgrade constructor
    function RocketUpgrade(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Set the version
        version = 1;
    }

    /**** Contract Upgrade Methods ***********/

    /// @param _name The name of an existing contract in the network
    /// @param _upgradedContractAddress The new contracts address that will replace the current one
    // TODO: Write unit test to verify
    function upgradeContract(string _name, address _upgradedContractAddress) onlyOwner external {
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
        // Log it
        ContractUpgraded(oldContractAddress, _upgradedContractAddress, now);
    }
}
