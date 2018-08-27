pragma solidity 0.4.24;

// Contracts
import "../../RocketBase.sol";
//import "../../contract/group/RocketGroupContract.sol";
// Interfaces
import "../../interface/settings/RocketNodeSettingsInterface.sol";



/// @title Handles node API methods in the Rocket Pool infrastructure
/// @author David Rugendyke

contract RocketNodeAPI is RocketBase {

    /*** Libs  *****************/

    /*** Contracts *************/

    RocketNodeSettingsInterface rocketNodeSettings = RocketNodeSettingsInterface(0);           // Settings for the nodes 
   


    /*** Events ****************/

    event NodeAdd (
        address ID,
        uint256 created
    );


    // TODO: Remove Flag Events
    event FlagString (
        string flag
    );

    event FlagUint (
        uint256 flag
    );

       
    /*** Modifiers *************/
    
       
    /*** Constructor *************/

    /// @dev rocketNode constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }


    /*** Getters *************/
 

    /*** Methods *************/

    /// @dev Register a new node address if it doesn't exist
    function add() public returns (bool) {
        // Get the group settings
        rocketNodeSettings = RocketNodeSettingsInterface(getContractAddress("rocketNodeSettings"));
        require(address(msg.sender) != address(0x0), "An error has occurred with the sending address.");
        // Log it
        emit NodeAdd(msg.sender, now);
        // Done
        return true;
    }

}