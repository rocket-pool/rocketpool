pragma solidity 0.4.24;

// Contracts
import "./RocketBase.sol";
// Interfaces
import "./interface/RocketStorageInterface.sol";


/// @title Admin only methods for Rocket Pool owner and admins
/// @author David Rugendyke
contract RocketAdmin is RocketBase {

    /*** Contracts **************/

  
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
    function setNodeTrusted(address _nodeAddress) public onlySuperUser() returns (bool) {
        // Check it exists first and isn't already trusted
        require(rocketStorage.getBool(keccak256(abi.encodePacked("node.exists", _nodeAddress))), "Node address does not exist.");
        require(rocketStorage.getBool(keccak256(abi.encodePacked("node.trusted", _nodeAddress))), "Node is already trusted.");
        // Set now
        rocketStorage.setBool(keccak256(abi.encodePacked("node.trusted", _nodeAddress)), true);
    }

   
}