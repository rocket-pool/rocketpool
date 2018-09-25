pragma solidity 0.4.24;

// Contracts
import "./RocketBase.sol";
// Interfaces
import "./interface/RocketStorageInterface.sol";
import "./interface/utils/lists/AddressSetStorageInterface.sol";


/// @title Admin only methods for Rocket Pool owner and admins
/// @author David Rugendyke
contract RocketAdmin is RocketBase {

    /*** Contracts **************/

    AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(0);

  
    /*** Events ****************/

       
    /*** Modifiers *************/


    /*** Constructor *************/

    /// @dev rocketPool constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }
    

    /*** Node Methods **********************************/


    /// @dev Set this node as a 'Trusted Node' - Is not required to stake as much ether as they receive, but does need the RPL. Is served after regular node operators to ensure the network can always grow.
    /// @param _nodeAddress The address of the node
    /// @param _trusted The flag indicating whether the node is trusted
    function setNodeTrusted(address _nodeAddress, bool _trusted) public onlySuperUser() returns (bool) {
        // Check it exists first and isn't already the specified status
        require(rocketStorage.getBool(keccak256(abi.encodePacked("node.exists", _nodeAddress))), "Node address does not exist.");
        require(rocketStorage.getBool(keccak256(abi.encodePacked("node.trusted", _nodeAddress))) != _trusted, "Node trusted status already set.");
        // Get contracts
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        // Set now
        rocketStorage.setBool(keccak256(abi.encodePacked("node.trusted", _nodeAddress)), _trusted);
        // Update available node indexes
        bytes32 oldAvailableKey = keccak256(abi.encodePacked("nodes.available", "trusted", !_trusted));
        bytes32 newAvailableKey = keccak256(abi.encodePacked("nodes.available", "trusted", _trusted));
        if (addressSetStorage.getIndexOf(oldAvailableKey, _nodeAddress) != -1) {
            addressSetStorage.removeItem(oldAvailableKey, _nodeAddress);
            addressSetStorage.addItem(newAvailableKey, _nodeAddress);
        }
        // Return success flag
        return true;
    }

   
}