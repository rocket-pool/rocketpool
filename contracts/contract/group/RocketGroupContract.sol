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
    uint256 private feePerc = 0;                                                // The fee this groups charges their users given as a % of 1 Ether (eg 0.02 ether = 2%)
    

    /*** Contracts ***************/

    RocketStorageInterface rocketStorage = RocketStorageInterface(0);           // The main Rocket Pool storage contract where primary persistant storage is maintained
    RocketGroupSettingsInterface rocketGroupSettings = RocketGroupSettingsInterface(0);

    /*** Events ******************/
 
    /*** Modifiers ***************/
     
    /*** Constructor *************/

    /// @dev RocketGroupContract constructor
    constructor(address _rocketStorageAddress) public {
        // Version
        version = 1;
        // Update the storage contract address
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
    }

    /*** Getters *************/

    /// @dev The fee this groups charges their users given as a % of 1 Ether (eg 0.02 ether = 2%)
    function geFeePerc() public view returns(uint256) { 
        // Get the fee for this groups users
        return feePerc;
    }

    /// @dev Get the fee that Rocket Pool charges for this group
    function getFeePercRocketPool() public view returns(uint256) { 
        // Get the RP fee
        rocketStorage.getUint(keccak256(abi.encodePacked("group.fee", address(this))));
    }


    /*** Setters *************/

    /// @dev Set the fee this group charges their users - Given as a % of 1 Ether (eg 0.02 ether = 2%)
    function setFeePerc(uint256 _stakingFeePerc) public onlyOwner returns(bool) { 
        // Check its a legit amount
        require(_stakingFeePerc >= 0, "User fee cannot be less than 0.");
        require(_stakingFeePerc <= 1 ether, "User fee cannot be greater than 100%.");
        // Ok set it
        feePerc = _stakingFeePerc;
        // Done
        return true;
    }
    
    /*** Methods *************/

    

}