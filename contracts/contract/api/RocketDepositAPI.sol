pragma solidity 0.4.24;


import "../../RocketBase.sol";
import "../../interface/api/RocketHelpersAPIInterface.sol";
import "../../interface/settings/RocketAPISettingsInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";


/// @title RocketDepositAPI - API for deposits into the Rocket Pool network
/// @author David Rugendyke

contract RocketDepositAPI is RocketBase {


    /*** Contracts **************/

    RocketHelpersAPIInterface rocketHelpersAPI = RocketHelpersAPIInterface(0);                          // Helpers for the API
    RocketAPISettingsInterface rocketAPISettings = RocketAPISettingsInterface(0);                       // The main settings contract for the API
    RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(0);        // The main settings contract for minipools

  
    /*** Events ****************/

    event Deposit (
        address indexed _from,                                              // Address that sent the deposit, must be registered to the GroupID
        address indexed _userID,                                            // Address of the users account that owns the deposit
        string  indexed _groupID,                                           // Group ID that controls the deposit
        string  durationID,                                                 // The deposits staking duration ID
        uint256 value,                                                      // Amount in wei deposited
        uint256 created                                                     // Timestamp of the deposit
    );



    /*** Constructor *************/
   
    /// @dev constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }

    
    /*** Methods *************/

   
    /// @notice Send `msg.value ether` Eth from the account of `message.caller.address()`, to an account accessible only by Rocket Pool at `to.address()`.
    /// @dev Deposit to Rocket Pool, can be from a user or a partner on behalf of their user
    /// @param _groupID The address of the group / 3rd party partner whom is in control of the supplid user account that the deposit belongs too
    /// @param _userID The address of the user whom the deposit belongs too
    /// @param _durationID The ID that determines which pool the user intends to join based on the staking blocks of that pool (3 months, 6 months etc)
    function deposit(string _groupID, address _userID, string _durationID) public payable returns(bool) { 
        // Get the latest API utility contract
        rocketHelpersAPI = RocketHelpersAPIInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketHelpersAPI"))));
        // Verify the deposit is acceptable
        if(rocketHelpersAPI.getDepositIsValid(msg.value, msg.sender, _groupID, _userID, _durationID)) {
            // TODO: Add in new deposit chunking queue mechanics
            // All good? Fire the event for the new deposit
            emit Deposit(msg.sender, _userID, _groupID, _durationID, msg.value, now);   
            // Done
            return true;
        }
        // Safety
        return false;    
    }


}
