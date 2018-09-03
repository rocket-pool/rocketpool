pragma solidity 0.4.24;

// Interfaces
import "./../../interface/token/ERC20.sol";
import "./../../interface/RocketStorageInterface.sol";
import "./../../interface/api/RocketNodeAPIInterface.sol";
import "./../../interface/settings/RocketNodeSettingsInterface.sol";
import "./../../interface/settings/RocketMinipoolSettingsInterface.sol";
// Libraries
import "./../../lib/SafeMath.sol";


/// @title The contract for a node that operates in Rocket Pool, holds the entities ether/rpl deposits and more
/// @author David Rugendyke

contract RocketNodeContract {

    /**** Libs *****************/
    
    using SafeMath for uint;


    /**** Properties ***********/

    address public owner;                                                           // The node that created the contract
    uint8   public version;                                                         // Version of this contract

    mapping (uint256 => DepositReservation) private depositReservations;            // Node operators deposit reservations
    uint256 public lastDepositReservedTime = 0;                                     // Time of the last reserved deposit

    
    /*** Contracts ***************/

    ERC20 rplContract = ERC20(0);                                                                   // The address of an ERC20 token contract
    RocketStorageInterface rocketStorage = RocketStorageInterface(0);                               // The main Rocket Pool storage contract where primary persistant storage is maintained
    RocketNodeAPIInterface rocketNodeAPI = RocketNodeAPIInterface(0);                               // The main node API
    RocketNodeSettingsInterface rocketNodeSettings = RocketNodeSettingsInterface(0);                // The main node settings
    RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(0);    // The main minipool settings


    /*** Structs ***************/

    struct DepositReservation {
        uint256 etherAmount;            // Amount of ether required
        uint256 rplAmount;              // Amount of RPL required
        uint256 rplRatio;               // Amount of RPL required per single ether deposited
        uint256 created;                // The time this reservation was made
        bool exists;
    }


    /*** Events ****************/


    event NodeDepositReservation (
        address indexed _from,                                              // Address that sent the deposit, must be registered to the GroupID
        uint256 etherAmount,                                                // Amount of ether required
        uint256 rplAmount,                                                  // Amount of RPL required
        string  durationID,                                                 // Duration of the stake
        uint256 rplRatio,                                                   // Amount of RPL required per single ether deposited
        uint256 created                                                     // The time this reservation was made
    );

    event NodeDepositEther (
        address indexed _from,                                              // Address that sent the deposit, must be registered to the GroupID
        string  durationID,                                                 // The deposits staking duration ID
        uint256 value,                                                      // Amount in wei deposited
        uint256 created                                                     // Timestamp of the deposit
    );


    // TODO: Remove Flag Events
    event FlagAddress (
        address flag
    );

    event FlagUint (
        uint256 flag
    );

 
    /*** Modifiers ***************/

    /// @dev Throws if called by any account other than the owner.
    modifier onlyNodeOwner() {
        require(msg.sender == owner, "Only the nodes etherbase account can perform this function.");
        _;
    }

    /// @dev Throws if the node doesn't have a deposit currently reserved
    modifier hasDepositReserved() {
        // Get the node settings
        rocketNodeSettings = RocketNodeSettingsInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketNodeSettings"))));
        require(depositReservations[lastDepositReservedTime].exists == true && now < (lastDepositReservedTime + rocketNodeSettings.getDepositReservationTime()), "Node does not have a current deposit reservation, please make one first before sending ether/rpl.");
        _;
    }

     
    /*** Constructor *************/

    /// @dev RocketNodeContract constructor
    constructor(address _rocketStorageAddress, address _owner) public {
        // Version
        version = 1;
        // Update the storage contract address
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
        // Add the RPL contract address
        rplContract = ERC20(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketPoolToken"))));
        // Set the node owner
        owner = _owner;
    }

    /*** Getters *************/
    
    
    /*** Setters *************/

    
    /*** Methods *************/

    /// @dev Reserves a deposit of Ether/RPL at the current rate. The node operator has 24hrs to deposit both once its locked in or it will expire.
    /// @param _amount The amount of ether the node operator wishes to deposit
    /// @param _durationID The ID that determines which pool the user intends to join based on the staking blocks of that pool (3 months, 6 months etc)
    function depositReserve(uint256 _amount, string _durationID) public returns(bool) { 
       // Get the node API
       rocketNodeAPI = RocketNodeAPIInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketNodeAPI"))));
       // Returns the amount of RPL required for a single ether
       uint256 rplRatio = rocketNodeAPI.getRPLRatio(_durationID); 
       // Verify the deposit is acceptable 
       if(rocketNodeAPI.getDepositReservationIsValid(msg.sender, _amount, _durationID, rplRatio, lastDepositReservedTime)) {  
            // How much RPL do we need for this deposit?
            uint256 rplAmount = (_amount.mul(rplRatio)).div(1 ether);
            // Record the reservation now
            depositReservations[now] = DepositReservation({
                etherAmount: _amount,
                rplAmount: rplAmount,
                rplRatio: rplRatio,
                created: now,
                exists: true
            });
            // All good? Fire the event for the new deposit
            emit NodeDepositReservation(msg.sender, _amount, rplAmount, _durationID, rplRatio, now);   
            // Save the last deposit reservation time
            lastDepositReservedTime = now;
            // Done
            return true;
        }
        // Safety
        return false;    
    }


   /// @notice Send `msg.value ether` Eth from the account of `message.caller.address()`, to Rocket Pool node account contract at `to.address()`.
   /// @dev Deposit to Rocket Pool from a node to their own contract. Anyone can deposit to a nodes contract, but they must have the ether/rpl to do so.
   /// @param _durationID The ID that determines which pool the user intends to join based on the staking blocks of that pool (3 months, 6 months etc)
   function depositEther(string _durationID) public payable hasDepositReserved() returns(bool) { 
       // Get the node API
       rocketNodeAPI = RocketNodeAPIInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketNodeAPI"))));
       // Verify the deposit is acceptable 
       if(rocketNodeAPI.getDepositEtherIsValid(msg.value, owner, _durationID)) {  
            // TODO: Add in new deposit chunking queue mechanics
            // All good? Fire the event for the new deposit
            emit NodeDepositEther(msg.sender, _durationID, msg.value, now);   
            // Done
            return true;
        }
       
        // Safety
        return false;    
    }

    

}