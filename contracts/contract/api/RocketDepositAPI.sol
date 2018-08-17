pragma solidity 0.4.24;


import "../../RocketBase.sol";
import "../../interface/settings/RocketAPISettingsInterface.sol";


/// @title RocketDepositAPI - API for deposits into the Rocket Pool network
/// @author David Rugendyke

contract RocketDepositAPI is RocketBase {


    /*** Contracts **************/

    RocketAPISettingsInterface rocketAPISettings = RocketAPISettingsInterface(0);       // The main settings contract most global parameters are maintained

  
    /*** Events ****************/

    event Deposit (
        address indexed _from,                                              // Address that sent the deposit, must be registered to the GroupID
        address indexed _userID,                                            // Address of the users account that owns the deposit
        string  indexed _groupID,                                           // Group ID that controls the deposit
        string  durationID,                                                 // The deposits staking duration ID
        uint256 value,                                                      // Amount in wei deposited
        uint256 created                                                     // Timestamp of the deposit
    );


      
    /*** Modifiers *************/


    // Conditional

    /// @dev API deposits must be validated
    modifier acceptableDeposit {
        rocketAPISettings = RocketAPISettingsInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketSettings"))));
        require(rocketAPISettings.getDepositAllowed() && msg.value >= rocketAPISettings.getDepositMin() && msg.value <= rocketAPISettings.getDepositMax(), "Incorrect deposit, check size is greater than min and less than max."); 
        _;
    }
  

    /*** Constructor *************/
   
    /// @dev constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }

    
    /*** Methods *************/

   
    /// @notice Send `msg.value ether` Eth from the account of `message.caller.address()`, to an account accessible only by Rocket Pool at `to.address()`.
    /// @dev Deposit to Rocket Pool, can be from a user or a partner on behalf of their user
    /// @param _userID The address of the user whom the deposit belongs too
    /// @param _groupID The address of the group / 3rd party partner whom is in control of the supplid user account that the deposit belongs too
    /// @param _durationID The ID that determines which pool the user intends to join based on the staking blocks of that pool (3 months, 6 months etc)
    function deposit(address _userID, string _groupID, string _durationID) acceptableDeposit public payable returns(bool) { 
        // Check to verify the supplied deposit duration id is legit
        //rocketPool = RocketPoolInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketPool"))));
        /*
        // Check to verify the supplied mini pool staking time id is legit
        rocketSettings = RocketAPISettingsInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketSettings"))));
        // Set it now
        uint256 poolStakingDuration = rocketSettings.getMiniPoolStakingTime(_durationID);
        // Assign the user to a matching staking time pool if they don't already belong to one awaiting deposits
        // If no pools are currently available, a new pool for the user will be created
        address poolUserBelongsToo = rocketPool.addUserToAvailablePool(_userAddress, _partnerAddress, poolStakingDuration);
        // We have a pool for the user, get the pool to withdraw the users deposit to its own contract account
        RocketPoolMini poolDepositTo = RocketPoolMini(poolUserBelongsToo);
        // Get the pool to withdraw the users deposit to its contract balance
        require(poolDepositTo.deposit.value(msg.value).gas(150000)(_userAddress) == true);
        // Update the pools status now
        poolDepositTo.updateStatus();
        */
        // All good? Fire the event for the new deposit
        emit Deposit(msg.sender, _userID, _groupID, _durationID, msg.value, now);   
        // Done
        return true;
        
    }


}
