pragma solidity 0.4.24;


import "../../RocketBase.sol";
import "../../interface/settings/RocketAPISettingsInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";

/// @title RocketHelpersAPI - Helper methods for the API
/// @author David Rugendyke

contract RocketHelpersAPI is RocketBase {


    /*** Contracts **************/

    RocketAPISettingsInterface rocketAPISettings = RocketAPISettingsInterface(0);                       // The main settings contract for the API
    RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(0);        // The main settings contract for minipools


    /*** Constructor *************/
   
    /// @dev constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }


     /*** Getters *************/

    // Deposits

    /// @dev Get the API deposit address - should be called before any deposit
    function getDepositAddress() public view returns(address) { 
        // Get the current deposit address 
        rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketDepositAPI")));
    }


    /// @dev Checks if the deposit parameters are correct for a successful deposit
    /// @param _value The amount being deposited
    /// @param _from  The address sending the deposit
    /// @param _groupID The identifier of the group / 3rd party partner whom is in control of the supplid user account that the deposit belongs too
    /// @param _userID The address of the user whom the deposit belongs too
    /// @param _durationID The ID that determines which pool the user intends to join based on the staking blocks of that pool (3 months, 6 months etc)
    function getDepositIsValid(uint256 _value, address _from, string _groupID, address _userID, string _durationID) public returns(bool) { 
        // Get the settings
        rocketAPISettings = RocketAPISettingsInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketAPISettings"))));
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketMinipoolSettings"))));
        // Deposits turned on?
        require(rocketAPISettings.getDepositAllowed(), "Deposits are currently disabled.");
        // Is the deposit value acceptable?
        require(_value >= rocketAPISettings.getDepositMin(), "Deposit value is less than the minimum allowed.");
        require(_value <= rocketAPISettings.getDepositMax(), "Deposit value is more than the maximum allowed.");
        // Check to verify the supplied mini pool staking time id is legit
        require(rocketMinipoolSettings.getMinipoolStakingDuration(_durationID) > 0, "Minipool staking duration ID specified does not match any current staking durations");
        // Check addresses are correct
        require(address(_from) != address(0x0), "From address is not a correct address");
        require(address(_userID) != address(0x0), "UserID address is not a correct address");
        // Verify the groupID exists
        require(bytes(getGroupName(_groupID)).length > 0, "Group ID specified does not match a group name or does not exist");
        // Verify the _from belongs to the groupID, only these addresses that belong to the group can interact with RP
        require(rocketStorage.getAddress(keccak256(abi.encodePacked("api.group.address", _from))) != address(0x0), "Group ID specified does not have any address that matches the sender.");
        // All good
        return true;
    }


    // Withdrawals

    /// @dev Get the API withdrawal address - should be called before any withdrawal
    function getWithdrawalAddress() public view returns(address) { 
        // Get the current withdrawal address 
        rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketWithdrawalAPI")));
    }


    // Groups

    /// @dev Get the group by its ID
    function getGroupName(string _groupID) public view returns(string) { 
        // Get the group name
        rocketStorage.getString(keccak256(abi.encodePacked("api.group.name", _groupID)));
    }

    /// @dev Get a verified address for the group that's allowed to interact with RP
    function getGroupAddress(string _groupID) public view returns(address) { 
        // Get the group name
        rocketStorage.getAddress(keccak256(abi.encodePacked("api.group.address", _groupID)));
    }


}
