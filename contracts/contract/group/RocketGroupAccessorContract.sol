pragma solidity 0.4.24;


import "./../../interface/RocketStorageInterface.sol";
import "../../interface/api/RocketDepositAPIInterface.sol";


/// @dev The contract for a default group accessor (depositor & withdrawer) implementation
/// @dev Allows any address to deposit to and withdraw from Rocket Pool through the group
/// @dev Must be manually assigned to the group as a depositor and withdrawer
/// @author Jake Pospischil

contract RocketGroupAccessorContract {


    /**** Properties ***********/


    uint8 public version;                                                       // Version of this contract
    address public groupID;                                                     // The address of the associated group contract


    /*** Contracts ***************/


    RocketStorageInterface rocketStorage = RocketStorageInterface(0);           // The main Rocket Pool storage contract where primary persistant storage is maintained
    RocketDepositAPIInterface rocketDepositAPI = RocketDepositAPIInterface(0);  // The Rocket Pool Deposit API


    /*** Constructor *************/


    /// @dev RocketGroupAccessorContract Constructor
    constructor(address _rocketStorageAddress, address _groupID) {
        // Initialise properties
        version = 1;
        groupID = _groupID;
        // Initialise RocketStorage
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
    }


    /*** Methods *************/


    /// @dev Make a deposit through the Rocket Pool Deposit API
    /// @param _durationID The ID of the staking duration that the user wishes to stake for (3 months, 6 months etc)
    function deposit(string _durationID) public payable returns (bool) {
        // Get deposit API
        rocketDepositAPI = RocketDepositAPIInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketDepositAPI"))));
        // Perform deposit
        require(rocketDepositAPI.deposit.value(msg.value)(groupID, msg.sender, _durationID), "The deposit was not made successfully");
        // Return success flag
        return true;
    }


    /// @dev Make a withdrawal through the Rocket Pool Withdrawal API
    /// TODO: implement


}
