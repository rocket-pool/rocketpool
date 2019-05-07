pragma solidity 0.5.0;


// Interfaces
import "../../interface/RocketPoolInterface.sol";
import "../../interface/RocketStorageInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/settings/RocketNodeSettingsInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../interface/casper/DepositInterface.sol";
import "../../interface/group/RocketGroupContractInterface.sol";
import "../../interface/node/RocketNodeContractInterface.sol";
import "../../interface/token/ERC20.sol";
import "../../interface/utils/pubsub/PublisherInterface.sol";
// Libraries
import "../../lib/SafeMath.sol";


/// @title A minipool under the main RocketPool, all major logic is contained within the RocketMinipoolDelegate contracts which are upgradable when minipools are deployed
/// @author David Rugendyke

contract RocketMinipool {

    /*** Libs  *****************/

    using SafeMath for uint;


    /**** Properties ***********/

    uint256 private calcBase = 1 ether;

    // General
    uint8   public version = 1;                                         // Version of this contract
    Status  private status;                                             // The current status of this pool, statuses are declared via Enum in the minipool settings
    Node    private node;                                               // Node this minipool is attached to, its creator 
    Staking private staking;                                            // Staking properties of the minipool to track
    uint256 private userDepositCapacity;                                // Total capacity for user deposits
    uint256 private userDepositTotal;                                   // Total value of all assigned user deposits
    uint256 private stakingUserDepositsWithdrawn;                       // Total value of user deposits withdrawn while staking
    mapping (bytes32 => StakingWithdrawal) private stakingWithdrawals;  // Information on deposit withdrawals made by users while staking
    bytes32[] private stakingWithdrawalIDs;

    // Deposits
    mapping (bytes32 => Deposit) private deposits;              // Deposits in this pool
    bytes32[] private depositIDs;                               // IDs of deposits in this pool for iteration


    /*** Contracts **************/

    ERC20 rplContract = ERC20(0);                                                                   // The address of our RPL ERC20 token contract
    ERC20 rpbContract = ERC20(0);                                                                   // The address of our RPB ERC20 token contract
    DepositInterface casperDeposit = DepositInterface(0);                                           // Interface of the Casper deposit contract
    RocketGroupContractInterface rocketGroupContract = RocketGroupContractInterface(0);             // The users group contract that they belong to
    RocketNodeContractInterface rocketNodeContract = RocketNodeContractInterface(0);                // The node contract for the node which owns this minipool
    RocketNodeSettingsInterface rocketNodeSettings = RocketNodeSettingsInterface(0);                // The settings for nodes
    RocketPoolInterface rocketPool = RocketPoolInterface(0);                                        // The main pool manager
    RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(0);    // The main settings contract most global parameters are maintained
    RocketStorageInterface rocketStorage = RocketStorageInterface(0);                               // The main Rocket Pool storage contract where primary persistant storage is maintained
    PublisherInterface publisher = PublisherInterface(0);                                           // Main pubsub system event publisher

    
    /*** Structs ***************/

    struct Status {
        uint8   current;                                        // The current status code, see RocketMinipoolSettings for more information
        uint8   previous;                                       // The previous status code
        uint256 time;                                           // The time the status last changed
        uint256 block;                                          // The block number the status last changed
    }

    struct Node {
        address owner;                                          // Etherbase address of the node which owns this minipool
        address contractAddress;                                // The nodes Rocket Pool contract
        uint256 depositEther;                                   // The nodes required ether contribution
        uint256 depositRPL;                                     // The nodes required RPL contribution
        bool    trusted;                                        // Was the node trusted at the time of minipool creation?
        bool    depositExists;                                  // The node operator's deposit exists
        uint256 balance;                                        // The node operator's ether balance
        uint256 userFee;                                        // The fee charged to users by the node, determined when the minipool begins staking
    }

    struct Staking {
        string  id;                                             // Duration ID
        uint256 duration;                                       // Duration in blocks
        uint256 balanceStart;                                   // Ether balance of this minipool when it begins staking
        uint256 balanceEnd;                                     // Ether balance of this minipool when it completes staking
        bytes   depositInput;                                   // DepositInput data to be submitted to the casper deposit contract
    }

    struct Deposit {
        address userID;                                         // Address ID of the user
        address groupID;                                        // Address ID of the user's group
        uint256 balance;                                        // Chunk balance deposited
        uint256 stakingTokensWithdrawn;                         // RPB tokens withdrawn by the user during staking
        uint256 feeRP;                                          // Rocket Pool's fee
        uint256 feeGroup;                                       // Group fee
        uint256 created;                                        // Creation timestamp
        bool    exists;                                         // Deposit exists
        uint256 idIndex;                                        // Deposit's index in the ID list
    }

    struct StakingWithdrawal {
        address groupFeeAddress;                                // The address to send group fees to
        uint256 amount;                                         // The amount withdrawn by the user
        uint256 feeRP;                                          // The fee charged to the user by Rocket Pool
        uint256 feeGroup;                                       // The fee charged to the user by the group
        bool exists;
    }


      
    /*** Events ****************/

    event DepositReceived (
        address indexed _fromAddress,                           // From address
        uint256 amount,                                         // Amount of the deposit
        uint256 created                                         // Creation timestamp
    );



    /*** Modifiers *************/


    /// @dev Only the node contract which this minipool belongs to
    /// @param _nodeContract The node contract address
    modifier isNodeContract(address _nodeContract) {
        require(_nodeContract != address(0x0) && _nodeContract == node.contractAddress, "Incorrect node contract address passed.");
        _;
    }

    /// @dev Only allow access from the latest version of the specified Rocket Pool contract
    modifier onlyLatestContract(string memory _contract) {
        require(msg.sender == getContractAddress(_contract), "Only the latest specified Rocket Pool contract can access this method.");
        _;
    }



    /*** Methods *************/
   
    /// @dev minipool constructor
    /// @param _rocketStorageAddress Address of Rocket Pools storage.
    /// @param _nodeOwner The address of the nodes etherbase account that owns this minipool.
    /// @param _durationID Staking duration ID (eg 3m, 6m etc)
    /// @param _depositInput The validator depositInput data to be submitted to the casper deposit contract
    /// @param _depositEther Ether amount deposited by the node owner
    /// @param _depositRPL RPL amount deposited by the node owner
    /// @param _trusted Is the node trusted at the time of minipool creation?
    constructor(address _rocketStorageAddress, address _nodeOwner, string memory _durationID, bytes memory _depositInput, uint256 _depositEther, uint256 _depositRPL, bool _trusted) public {
        // Update the storage contract address
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
        // Get minipool settings
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        // Set the address of the casper deposit contract
        casperDeposit = DepositInterface(getContractAddress("casperDeposit"));
        // Add the token contract addresses
        rplContract = ERC20(getContractAddress("rocketPoolToken"));
        rpbContract = ERC20(getContractAddress("rocketBETHToken"));
        // Set the initial status
        status.current = 0;
        status.time = now;
        status.block = block.number;
        // Set the node owner and contract address
        node.owner = _nodeOwner;
        node.depositEther = _depositEther;
        node.depositRPL = _depositRPL;
        node.trusted = _trusted;
        node.contractAddress = rocketStorage.getAddress(keccak256(abi.encodePacked("node.contract", _nodeOwner)));
        // Initialise the node contract
        rocketNodeContract = RocketNodeContractInterface(node.contractAddress);
        // Set the initial staking properties
        staking.id = _durationID;
        staking.duration = rocketMinipoolSettings.getMinipoolStakingDuration(_durationID);
        staking.depositInput = _depositInput;
        // Set the user deposit capacity
        userDepositCapacity = rocketMinipoolSettings.getMinipoolLaunchAmount().sub(_depositEther);
    }


    // Payable
    
    /// @dev Fallback function where our deposit + rewards will be received after requesting withdrawal from Casper
    function() external payable { 
        // Log the deposit received
        emit DepositReceived(msg.sender, msg.value, now);       
    }


    // Utility Methods

    /// @dev Get the the contracts address - This method should be called before interacting with any RP contracts to ensure the latest address is used
    function getContractAddress(string memory _contractName) private view returns(address) { 
        // Get the current API contract address 
        return rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", _contractName)));
    }


    /*** NODE ***********************************************/

    // Getters

    /// @dev Gets the node contract address
    function getNodeOwner() public view returns(address) {
        return node.owner;
    }

    /// @dev Gets the node contract address
    function getNodeContract() public view returns(address) {
        return node.contractAddress;
    }

    /// @dev Gets the amount of ether the node owner must deposit
    function getNodeDepositEther() public view returns(uint256) {
        return node.depositEther;
    }
    
    /// @dev Gets the amount of RPL the node owner must deposit
    function getNodeDepositRPL() public view returns(uint256) {
        return node.depositRPL;
    }

    /// @dev Gets the node's trusted status (at the time of minipool creation)
    function getNodeTrusted() public view returns(bool) {
        return node.trusted;
    }

    /// @dev Gets whether the node operator's deposit currently exists
    function getNodeDepositExists() public view returns(bool) {
        return node.depositExists;
    }

    /// @dev Gets the node operator's ether balance
    function getNodeBalance() public view returns(uint256) {
        return node.balance;
    }


    // Methods

    /// @dev Set the ether / rpl deposit and check it
    function nodeDeposit() public payable isNodeContract(msg.sender) returns(bool) {
        // Will throw if conditions are not met in delegate
        (bool success,) = getContractAddress("rocketMinipoolDelegateNode").delegatecall(abi.encodeWithSignature("nodeDeposit()"));
        require(success, "Delegate call failed.");
        // Success
        return true;
    }

    /// @dev Withdraw ether / rpl deposit from the minipool if initialised, timed out or withdrawn
    function nodeWithdraw() public isNodeContract(msg.sender) returns(bool) {
        // Will throw if conditions are not met in delegate
        (bool success,) = getContractAddress("rocketMinipoolDelegateNode").delegatecall(abi.encodeWithSignature("nodeWithdraw()"));
        require(success, "Delegate call failed.");
        // Success
        return true;
    }


    /*** DEPOSITS ***********************************************/

    // Getters

    /// @dev Returns the deposit count for this pool
    function getDepositCount() public view returns(uint256) {
        return depositIDs.length;
    }

    /// @dev Returns true if the deposit is in this pool
    function getDepositExists(bytes32 _depositID) public view returns(bool) {
        return (depositIDs[_depositID].exists && depositIDs[_depositID].balance > 0);
    }

    /// @dev Returns the deposit's user ID
    function getDepositUserID(bytes32 _depositID) public view returns(address) {
        return depositIDs[_depositID].userID;
    }

    /// @dev Returns the deposit's group ID
    function getDepositGroupID(bytes32 _depositID) public view returns(address) {
        return depositIDs[_depositID].groupID;
    }

    /// @dev Returns the balance of the deposit
    function getDepositBalance(bytes32 _depositID) public view returns(uint256) {
        return depositIDs[_depositID].balance;
    }

    /// @dev Returns the amount of the deposit withdrawn as RPB
    function getDepositStakingTokensWithdrawn(bytes32 _depositID) public view returns(uint256) {
        return depositIDs[_depositID].stakingTokensWithdrawn;
    }


    // Methods

    /// @dev Deposit a user's ether to this contract. Will register the deposit if it doesn't exist in this contract already.
    /// @param _depositID The ID of the deposit
    /// @param _userID New user address
    /// @param _groupID The 3rd party group the user belongs to
    function deposit(bytes32 _depositID, address _userID, address _groupID) public payable onlyLatestContract("rocketDepositQueue") returns(bool) {
        // Will throw if conditions are not met in delegate or call fails
        (bool success,) = getContractAddress("rocketMinipoolDelegateDeposit").delegatecall(abi.encodeWithSignature("deposit(bytes32,address,address)", _depositID, _userID, _groupID));
        require(success, "Delegate call failed.");
        // Success
        return true;
    }


    /// @dev Refund a deposit and remove it from this contract (if minipool stalled).
    /// @param _depositID The ID of the deposit
    /// @param _refundAddress The address to refund the deposit to
    function refund(bytes32 _depositID, address _refundAddress) public onlyLatestContract("rocketDeposit") returns(bool) {
        // Will throw if conditions are not met in delegate or call fails
        (bool success,) = getContractAddress("rocketMinipoolDelegateDeposit").delegatecall(abi.encodeWithSignature("refund(bytes32,address)", _depositID, _refundAddress));
        require(success, "Delegate call failed.");
        // Success
        return true;
    }


    /// @dev Withdraw some amount of a deposit as RPB tokens, forfeiting rewards for that amount, and remove it if the entire deposit is withdrawn (if minipool staking).
    /// @param _depositID The ID of the deposit
    /// @param _withdrawnAmount The amount of the deposit withdrawn
    /// @param _tokenAmount The amount of RPB tokens withdrawn
    /// @param _withdrawnAddress The address the deposit was withdrawn to
    function withdrawStaking(bytes32 _depositID, uint256 _withdrawnAmount, uint256 _tokenAmount, address _withdrawnAddress) public onlyLatestContract("rocketDeposit") returns(bool) {
        // Will throw if conditions are not met in delegate or call fails
        (bool success,) = getContractAddress("rocketMinipoolDelegateDeposit").delegatecall(abi.encodeWithSignature("withdrawStaking(bytes32,uint256,uint256,address)", _depositID, _withdrawnAmount, _tokenAmount, _withdrawnAddress));
        require(success, "Delegate call failed.");
        // Success
        return true;
    }


    /// @dev Withdraw a deposit as RPB tokens and remove it from this contract (if minipool withdrawn).
    /// @param _depositID The ID of the deposit
    /// @param _withdrawalAddress The address to withdraw the deposit to
    function withdraw(bytes32 _depositID, address _withdrawalAddress) public onlyLatestContract("rocketDeposit") returns(bool) {
        // Will throw if conditions are not met in delegate or call fails
        (bool success,) = getContractAddress("rocketMinipoolDelegateDeposit").delegatecall(abi.encodeWithSignature("withdraw(bytes32,address)", _depositID, _withdrawalAddress));
        require(success, "Delegate call failed.");
        // Success
        return true;
    }


    /*** MINIPOOL  ******************************************/


    // Getters

    /// @dev Gets the current status of the minipool
    function getStatus() public view returns(uint8) {
        return status.current;
    }

    // @dev Get the last time the status changed
    function getStatusChangedTime() public view returns(uint256) {
        return status.time;
    }

    // @dev Get the last block no where the status changed
    function getStatusChangedBlock() public view returns(uint256) {
        return status.block;
    }

    /// @dev Returns the current staking duration ID
    function getStakingDurationID() public view returns (string memory) {
        return staking.id;
    }

    /// @dev Returns the current staking duration in blocks
    function getStakingDuration() public view returns(uint256) {
        return staking.duration;
    }

    /// @dev Returns the minipool's deposit input data to be submitted to casper
    function getDepositInput() public view returns (bytes memory) {
        return staking.depositInput;
    }

    /// @dev Gets the total user deposit capacity
    function getUserDepositCapacity() public view returns(uint256) {
        return userDepositCapacity;
    }

    /// @dev Gets the total value of all assigned user deposits
    function getUserDepositTotal() public view returns(uint256) {
        return userDepositTotal;
    }

    /// @dev Gets the total RPB tokens withdrawn during staking
    function getStakingUserDepositsWithdrawn() public view returns(uint256) {
        return stakingUserDepositsWithdrawn;
    }


    // Methods

    /// @dev Sets the status of the pool based on its current parameters 
    function updateStatus() public returns(bool) {
        // Will update the status of the pool if conditions are correct
        (bool success,) = getContractAddress("rocketMinipoolDelegateStatus").delegatecall(abi.encodeWithSignature("updateStatus()"));
        require(success, "Delegate call failed.");
        // Success
        return true;
    }

    /// @dev Sets the minipool to logged out
    function logoutMinipool() public onlyLatestContract("rocketNodeWatchtower") returns (bool) {
        // Will update the status of the pool if conditions are correct
        (bool success,) = getContractAddress("rocketMinipoolDelegateStatus").delegatecall(abi.encodeWithSignature("logoutMinipool()"));
        require(success, "Delegate call failed.");
        // Success
        return true;
    }

    /// @dev Sets the minipool to withdrawn and sets its balance at withdrawal
    /// @param _withdrawalBalance The minipool's balance at withdrawal
    function withdrawMinipool(uint256 _withdrawalBalance) public onlyLatestContract("rocketNodeWatchtower") returns (bool) {
        // Will update the status of the pool if conditions are correct
        (bool success,) = getContractAddress("rocketMinipoolDelegateStatus").delegatecall(abi.encodeWithSignature("withdrawMinipool(uint256)", _withdrawalBalance));
        require(success, "Delegate call failed.");
        // Success
        return true;
    }


}
