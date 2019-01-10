pragma solidity 0.5.0;

// Interfaces
import "./../../interface/token/ERC20.sol";
import "./../../interface/RocketStorageInterface.sol";
import "./../../interface/api/RocketNodeAPIInterface.sol";
import "./../../interface/minipool/RocketMinipoolInterface.sol";
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

    address private owner;                                                          // The node that created the contract
    uint8   public version;                                                         // Version of this contract

    DepositReservation private depositReservation;                                  // Node operator's deposit reservation


    /*** Contracts ***************/

    ERC20 rplContract = ERC20(0);                                                                   // The address of our RPL ERC20 token contract
    RocketStorageInterface rocketStorage = RocketStorageInterface(0);                               // The main Rocket Pool storage contract where primary persistant storage is maintained
    RocketNodeAPIInterface rocketNodeAPI = RocketNodeAPIInterface(0);                               // The main node API
    RocketMinipoolInterface rocketMinipool = RocketMinipoolInterface(0);                            // Minipool contract 
    RocketNodeSettingsInterface rocketNodeSettings = RocketNodeSettingsInterface(0);                // The main node settings
    RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(0);    // The main minipool settings


    /*** Structs ***************/

    struct DepositReservation {
        string  durationID;             // The deposit duration (eg 3m, 6m etc)
        uint256 etherAmount;            // Amount of ether required
        uint256 rplAmount;              // Amount of RPL required
        uint256 rplRatio;               // Amount of RPL required per ether deposited
        uint256 created;                // The time this reservation was made
        bool exists;
    }


    /*** Events ****************/


    event NodeDepositReservation (
        address indexed _from,                                              // Address that sent the deposit
        uint256 etherAmount,                                                // Amount of ether required
        uint256 rplAmount,                                                  // Amount of RPL required
        string  durationID,                                                 // Duration of the stake
        uint256 rplRatio,                                                   // Amount of RPL required per single ether deposited
        uint256 created                                                     // The time this reservation was made
    );

    event NodeDepositReservationCancelled (
        address indexed _from,                                              // Address that sent the deposit
        uint256 reservedTime,                                               // The time the reservation was made
        uint256 created                                                     // The time this reservation was canned
    );
    

    event NodeDepositMinipool (
        address indexed _minipool,                                          // Address of the minipool
         string tokenType,                                                  // The type of deposit eg ETH / RPL
        uint256 amount,                                                     // Amount deposit
        uint256 created                                                     // The time of the deposit
    );

    event NodeWithdraw (
         string tokenType,                                                  // The type of deposit eg ETH / RPL
        uint256 amount,                                                     // Amount to withdraw
        uint256 created                                                     // The time of the withdrawal
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
        require(depositReservation.exists && now < (depositReservation.created + rocketNodeSettings.getDepositReservationTime()), "Node does not have a current deposit reservation, please make one first before sending ether/rpl.");
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

    /// @dev Returns the nodes owner - its coinbase account
    function getOwner() public view returns(address) { 
        return owner;
    }

    /// @dev Returns the current ETH balance on the contract
    function getBalanceETH() public view returns(uint256) { 
        return address(this).balance;
    }

    /// @dev Returns the current RPL balance on the contract
    function getBalanceRPL() public view returns(uint256) { 
        return rplContract.balanceOf(address(this));
    }

    /// @dev Returns true if there is a current deposit reservation
    function getHasDepositReservation() public hasDepositReserved() returns(bool) { 
        return true;
    }

    /// @dev Returns the time of the deposit reservation
    function getDepositReservedTime() public hasDepositReserved() returns(uint256) { 
        return depositReservation.created;
    }

    /// @dev Returns the current deposit reservation ether required
    function getDepositReserveEtherRequired() public hasDepositReserved() returns(uint256) { 
        return depositReservation.etherAmount;
    }

    /// @dev Returns the current deposit reservation RPL required
    function getDepositReserveRPLRequired() public hasDepositReserved() returns(uint256) { 
        return depositReservation.rplAmount;
    }

    /// @dev Returns the current deposit reservation duration set
    function getDepositReserveDurationID() public hasDepositReserved() returns (string memory) { 
        return depositReservation.durationID;
    }

    
    /*** Setters *************/

    
    /*** Methods *************/


    /// @dev Default payable method to receive minipool node withdrawals
    function() external payable {}


    /// @dev Reserves a deposit of Ether/RPL at the current rate. The node operator has 24hrs to deposit both once its locked in or it will expire.
    /// @param _amount The amount of ether the node operator wishes to deposit
    /// @param _durationID The ID that determines which pool the user intends to join based on the staking blocks of that pool (3 months, 6 months etc)
    function depositReserve(uint256 _amount, string memory _durationID) public returns(bool) { 
        // Get the node API
        rocketNodeAPI = RocketNodeAPIInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketNodeAPI"))));
        // Verify the deposit is acceptable
        rocketNodeAPI.checkDepositReservationIsValid(msg.sender, _amount, _durationID, depositReservation.created);
        // Get the RPL amount and ratio for the deposit
        (uint256 rplAmount, uint256 rplRatio) = rocketNodeAPI.getRPLRequired(_amount, _durationID);
        // Record the reservation now
        depositReservation = DepositReservation({
            durationID: _durationID,
            etherAmount: _amount,
            rplAmount: rplAmount,
            rplRatio: rplRatio,
            created: now,
            exists: true
        });
        // All good? Fire the event for the new deposit
        emit NodeDepositReservation(msg.sender, _amount, rplAmount, _durationID, rplRatio, now);   
        // Done
        return true;
    }


    /// @dev Cancel a deposit reservation that was made - only node owner
    function depositReserveCancel() public onlyNodeOwner() hasDepositReserved() returns(bool) { 
        // Get reservation time
        uint256 reservationTime = depositReservation.created;
        // Delete the reservation
        delete depositReservation;
        // Log it
        emit NodeDepositReservationCancelled(msg.sender, reservationTime, now);
        // Done
        return true;
    }


    /// @notice Send `msg.value ether` Eth from the account of `message.caller.address()`, to Rocket Pool node account contract at `to.address()`.
    /// @dev Deposit to Rocket Pool from a node to their own contract. Anyone can deposit to a nodes contract, but they must have the ether/rpl to do so. User must have a reserved deposit and the RPL required to cover the ether deposit.
    function deposit() public payable hasDepositReserved() returns(bool) { 
        // Get the node API
        rocketNodeAPI = RocketNodeAPIInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketNodeAPI"))));
        // Get the node Settings
        rocketNodeSettings = RocketNodeSettingsInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketNodeSettings"))));
        // Check the contract has sufficient RPL balance for the reserved deposit
        require(getDepositReserveRPLRequired() <= getBalanceRPL(), "Node contract does not have enough RPL to cover the reserved ether deposit.");
        // Verify the deposit is acceptable and create a minipool for it, will return how many minipools were created
        address[] memory minipools = rocketNodeAPI.deposit(owner);
        // Did we make any?
        if(minipools.length > 0) {   
            // Transfer balances for each minipool
            for(uint8 i = 0; i < minipools.length; i++) {
                // Get the minipool
                rocketMinipool = RocketMinipoolInterface(minipools[i]);
                // Transfer the RPL to the minipool now - note: May have to look at manually setting gas here via a call
                if (rplContract.transfer(minipools[i], rocketMinipool.getNodeDepositRPL())) {
                    emit NodeDepositMinipool(minipools[i], "RPL", rocketMinipool.getNodeDepositRPL(), now);
                } 
                // Transfer the ether to the minipool now
                if (rocketMinipool.nodeDeposit.value(rocketMinipool.getNodeDepositEther()).gas(rocketNodeSettings.getDepositEtherGasLimit())()) {
                    emit NodeDepositMinipool(minipools[i], "ETH", rocketMinipool.getNodeDepositEther(), now);
                }
            }
            // Delete the reservation
            delete depositReservation;
            // Done
            return true;
        }
    }


    /// @dev Withdraw ether / rpl from a timed out or withdrawn minipool
    /// @param _minipool The address of the minipool to withdraw the deposit from
    function withdrawMinipoolDeposit(address _minipool) public onlyNodeOwner() returns(bool) {
        // Get the node Settings
        rocketNodeSettings = RocketNodeSettingsInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketNodeSettings"))));
        // Check whether node withdrawals are currently allowed
        require(rocketNodeSettings.getWithdrawalAllowed(), "Node withdrawals are not currently allowed.");
        // Get the minipool
        rocketMinipool = RocketMinipoolInterface(_minipool);
        // Withdraw deposit
        require(rocketMinipool.nodeWithdraw(), "The minipool deposit was not withdrawn successfully.");
        // Done
        return true;
    }


    /// @dev Withdraw ether from the contract
    /// @param _amount Amount of ether in wei they wish to withdraw
    function withdrawEther(uint256 _amount) public onlyNodeOwner() returns(bool) {
        // Check if they have enough
        require(getBalanceETH() >= _amount, "Not enough ether in node contract for withdrawal size requested.");
        // Lets send it back
        msg.sender.transfer(_amount);
        // Done
        return true;
    }

    /// @dev Withdraw RPL from the contract
    /// @param _amount Amount of RPL in wei they wish to withdraw
    function withdrawRPL(uint256 _amount) public onlyNodeOwner() returns(bool) {
        // Check if they have enough
        require(getBalanceRPL() >= _amount, "Not enough RPL in node contract for withdrawal size requested.");
        // Lets send it back
        rplContract.transfer(owner, _amount);
        // Done
        return true;
    }

    /// @dev Perform a node checkin
    /// @param _averageLoad The average server load on the node over the last checkin period
    /// @param _nodeFeeVote The node fee percentage vote: 0 = no change; 1 = increase; 2 = decrease
    function checkin(uint256 _averageLoad, uint256 _nodeFeeVote) public onlyNodeOwner() returns(bool) {
        // Get the node API
        rocketNodeAPI = RocketNodeAPIInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketNodeAPI"))));
        // Perform the checkin
        require(rocketNodeAPI.checkin(owner, _averageLoad, _nodeFeeVote), "Node checkin unsuccessful");
        // Done
        return true;
    }


}