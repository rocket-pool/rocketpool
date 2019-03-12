pragma solidity 0.5.0;


// Interfaces
import "../../interface/RocketPoolInterface.sol";
import "../../interface/RocketStorageInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/settings/RocketNodeSettingsInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../interface/casper/DepositInterface.sol";
import "../../interface/group/RocketGroupContractInterface.sol";
import "../../interface/token/ERC20.sol";
import "../../interface/utils/pubsub/PublisherInterface.sol";
// Libraries
import "../../lib/SafeMath.sol";


/// @title The minipool delegate for node methods, should contain all primary logic for methods that minipools use, is entirely upgradable so that currently deployed pools can get any bug fixes or additions - storage here MUST match the minipool contract
/// @author David Rugendyke

contract RocketMinipoolDelegateNode {

    /*** Libs  *****************/

    using SafeMath for uint;


    /**** Properties ***********/

    uint256 private calcBase = 1 ether;

    // General
    uint8   public version = 1;                                     // Version of this contract
    Status  private status;                                         // The current status of this pool, statuses are declared via Enum in the minipool settings
    Node    private node;                                           // Node this minipool is attached to, its creator 
    Staking private staking;                                        // Staking properties of the minipool to track
    uint256 private userDepositCapacity;                            // Total capacity for user deposits
    uint256 private userDepositTotal;                               // Total value of all assigned user deposits
    uint256 private stakingUserDepositsWithdrawn;                   // Total value of user deposits withdrawn while staking
    StakingWithdrawal[] private stakingUserDepositsWithdrawals;     // Information on deposit withdrawals made by users while staking

    // Users
    mapping (address => User) private users;                    // Users in this pool
    mapping (address => address) private usersBackupAddress;    // Users backup withdrawal address => users current address in this pool, need these in a mapping so we can do a reverse lookup using the backup address
    address[] private userAddresses;                            // Users in this pool addresses for iteration
    


    /*** Contracts **************/

    ERC20 rplContract = ERC20(0);                                                                   // The address of our RPL ERC20 token contract
    ERC20 rpbContract = ERC20(0);                                                                   // The address of our RPB ERC20 token contract
    DepositInterface casperDeposit = DepositInterface(0);                                           // Interface of the Casper deposit contract
    RocketGroupContractInterface rocketGroupContract = RocketGroupContractInterface(0);             // The users group contract that they belong too
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

    struct User {
        address user;                                           // Address of the user
        address backup;                                         // The backup address of the user
        address groupID;                                        // Address ID of the users group
        uint256 balance;                                        // Chunk balance deposited
        int256  rewards;                                        // Rewards received after Casper
        uint256 stakingTokensWithdrawn;                         // RPB tokens withdrawn by the user during staking
        uint256 feeRP;                                          // Rocket Pools fee
        uint256 feeGroup;                                       // Group fee
        uint256 created;                                        // Creation timestamp
        bool    exists;                                         // User exists?
        uint256 addressIndex;                                   // User's index in the address list
    }

    struct StakingWithdrawal {
        address groupID;                                        // The address of the group the user belonged to
        uint256 amount;                                         // The amount withdrawn by the user
        uint256 groupFee;                                       // The fee charged to the user by the group
    }


    /*** Events ****************/


    event NodeDeposit (
        address indexed _from,                                  // Transferred from
        uint256 etherAmount,                                    // Amount of ETH
        uint256 rplAmount,                                      // Amount of RPL
        uint256 created                                         // Creation timestamp
    );

    event NodeWithdrawal (
        address indexed _to,                                    // Transferred to
        uint256 etherAmount,                                    // Amount of ETH
        uint256 rpbAmount,                                      // Amount of RPB
        uint256 rplAmount,                                      // Amount of RPL
        uint256 created                                         // Creation timestamp
    );


    /*** Modifiers *************/


    /// @dev Only the node owner which this minipool belongs to
    /// @param _nodeOwner The node owner address.
    modifier isNodeOwner(address _nodeOwner) {
        require(_nodeOwner != address(0x0) && _nodeOwner == node.owner, "Incorrect node owner address passed.");
        _;
    }

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
    constructor(address _rocketStorageAddress) public {
        // Update the storage contract address
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
        // Get minipool settings
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        // Set the address of the casper deposit contract
        casperDeposit = DepositInterface(getContractAddress("casperDeposit"));
        // Add the token contract addresses
        rplContract = ERC20(getContractAddress("rocketPoolToken"));
        rpbContract = ERC20(getContractAddress("rocketBETHToken"));
    }


    /// @dev Get the the contracts address - This method should be called before interacting with any RP contracts to ensure the latest address is used
    function getContractAddress(string memory _contractName) private view returns(address) { 
        // Get the current API contract address 
        return rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", _contractName)));
    }


    /*** Node methods ********/


    /// @dev Set the ether / rpl deposit and check it
    function nodeDeposit() public payable isNodeContract(msg.sender) returns(bool) {
        // Get minipool settings
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        // Check the RPL exists in the minipool now, should have been sent before the ether
        require(rplContract.balanceOf(address(this)) >= node.depositRPL, "RPL deposit size does not match the minipool amount set when it was created.");
        // Check it is the correct amount passed when the minipool was created
        require(msg.value == node.depositEther, "Ether deposit size does not match the minipool amount set when it was created.");
        // Check that the node operator has not already deposited
        require(node.depositExists == false, "Node owner has already made deposit for this minipool.");
        // Set node operator deposit flag & balance
        node.depositExists = true;
        node.balance = msg.value;
        // Fire deposit event
        emit NodeDeposit(msg.sender, msg.value, rplContract.balanceOf(address(this)), now);
        // All good
        return true;
    }


    /// @dev Withdraw ether / rpl deposit from the minipool if initialised, timed out or withdrawn
    function nodeWithdraw() public isNodeContract(msg.sender) returns(bool) {
        // Check current status
        require(status.current == 0 || status.current == 4 || status.current == 6, "Minipool is not currently allowing node withdrawals.");
        // Check node operator's deposit exists
        require(node.depositExists == true, "Node operator does not have a deposit in minipool.");
        // Get withdrawal amounts
        uint256 nodeBalance = node.balance;
        uint256 etherAmount = 0;
        uint256 rpbAmount = 0;
        uint256 rplAmount = rplContract.balanceOf(address(this));
        // Update node operator deposit flag & balance
        node.depositExists = false;
        node.balance = 0;
        // Transfer RPL balance to node contract
        if (rplAmount > 0) { require(rplContract.transfer(node.contractAddress, rplAmount), "RPL balance transfer error."); }
        // Refunding ether to node contract if initialised or timed out
        if (status.current == 0 || status.current == 6) {
            etherAmount = nodeBalance;
            if (etherAmount > 0) { address(uint160(node.contractAddress)).transfer(etherAmount); }
        }
        // Transferring RPB to node contract if withdrawn
        else {
            rpbAmount = nodeBalance.mul(staking.balanceEnd).div(staking.balanceStart);
            if (rpbAmount > 0) { require(rpbContract.transfer(node.contractAddress, rpbAmount), "RPB balance transfer error."); }
        }
        // Fire withdrawal event
        emit NodeWithdrawal(msg.sender, etherAmount, rpbAmount, rplAmount, now);
        // Update the status
        RocketMinipoolInterface minipool = RocketMinipoolInterface(address(this));
        minipool.updateStatus();
        // Success
        return true;
    }


}
