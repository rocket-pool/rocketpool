pragma solidity 0.4.24;


// Interfaces
import "./../../interface/RocketStorageInterface.sol";
import "./../../interface/settings/RocketGroupSettingsInterface.sol";
// Utilities
import "./../../contract/utils/Ownable.sol";


/// @title The contract for a group that operates in Rocket Pool, holds the entities fees and more
/// @author David Rugendyke

contract RocketGroupContract is Ownable {

    /**** Properties ***********/

    uint8 public version;                                                       // Version of this contract
    uint256 private stakingFeePerc = 0;                                         // The fee this groups charges their users given as a % of 1 Ether (eg 0.02 ether = 2%)
                                        
        

    /*** Contracts ***************/

    RocketStorageInterface rocketStorage = RocketStorageInterface(0);           // The main Rocket Pool storage contract where primary persistant storage is maintained

    /*** Events ******************/
 
    /*** Modifiers ***************/
     
    /*** Constructor *************/

    /// @dev RocketGroupContract constructor
    constructor(address _rocketStorageAddress) public {
        // Version
        version = 1;
        // Update the storage contract address
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
        // Get our rocket group settings
        RocketGroupSettingsInterface rocketGroupSettings = RocketGroupSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketGroupSettings")));
    }

    /*** Getters *************/

    /// @dev Get the fee that Rocket Pool charges for this group
    function getRocketPoolFee(string _groupID) public view returns(string) { 
        // Get the group name
        rocketStorage.getString(keccak256(abi.encodePacked("group.fee", address(this))));
    }
    
    /*** Methods *************/

    

}