pragma solidity 0.4.24;


import "./../../interface/RocketStorageInterface.sol";
import "../../interface/api/RocketDepositAPIInterface.sol";


/// @dev The contract for a default group accessor (depositor & withdrawer) implementation
/// @dev Allows any address to deposit to and withdraw from Rocket Pool through the group
/// @dev Must be manually assigned to the group as a depositor and withdrawer
/// @author Jake Pospischil

contract RocketGroupAccessorContract {


    /**** Properties *************/


    uint8 public version;                                                       // Version of this contract
    address public groupID;                                                     // The address of the associated group contract


    /*** Contracts ***************/


    RocketStorageInterface rocketStorage = RocketStorageInterface(0);           // The main Rocket Pool storage contract where primary persistant storage is maintained
    RocketDepositAPIInterface rocketDepositAPI = RocketDepositAPIInterface(0);  // The Rocket Pool Deposit API


    /*** Constructor *************/


    /// @dev RocketGroupAccessorContract Constructor
    constructor(address _rocketStorageAddress, address _groupID) public {
        // Initialise properties
        version = 1;
        groupID = _groupID;
        // Initialise RocketStorage
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
    }


    /*** Public Methods **********/


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


    /// @dev Refund a queued deposit through the Rocket Pool Deposit API
    /// @param _durationID The ID of the staking duration of the deposit to refund
    /// @param _depositID The ID of the deposit to refund
    function refundDeposit(string _durationID, bytes32 _depositID) public returns (bool) {
        // Get deposit API
        rocketDepositAPI = RocketDepositAPIInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketDepositAPI"))));
        // Perform refund
        require(rocketDepositAPI.refundDeposit(groupID, msg.sender, _durationID, _depositID), "The deposit was not refunded successfully");
        // Return success flag
        return true;
    }


    /// @dev Make a withdrawal through the Rocket Pool Withdrawal API
    /// TODO: implement


    /*** Rocket Pool Methods *****/


    /// @dev Receive a deposit refund from Rocket Pool
    function receiveRocketpoolDepositRefund(address _groupID, address _userID, string _durationID, bytes32 _depositID) external payable returns (bool) {
        // Only callable by Rocket Pool deposit contract
        require(msg.sender == rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketDeposit"))), "Deposit refunds can only be sent by Rocket Pool Deposit contract");
        // Check parameters
        require(_groupID == groupID);
        require(_userID != 0x0);
        require(bytes(_durationID).length > 0);
        require(_depositID != 0x0);
        // Transfer ether to user
        require(_userID.call.value(msg.value)(), "Unable to send refunded ether to user");
        // Return success flag
        return true;
    }


}
