pragma solidity 0.5.8;


import "../../interface/RocketPoolInterface.sol";
import "../../interface/RocketStorageInterface.sol";
import "../../interface/casper/DepositInterface.sol";
import "../../interface/group/RocketGroupContractInterface.sol";
import "../../interface/node/RocketNodeContractInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../interface/settings/RocketNodeSettingsInterface.sol";
import "../../interface/token/ERC20.sol";
import "../../interface/utils/pubsub/PublisherInterface.sol";


/// @title Minipool base class with storage layout and structs
/// @author Jake Pospischil

contract RocketMinipoolBase {


    /*** Properties *************/

    uint256 internal calcBase = 1 ether;

    // General
    uint8   public version = 1;                                          // Version of this contract
    Status  internal status;                                             // The current status of this pool, statuses are declared via Enum in the minipool settings
    Node    internal node;                                               // Node this minipool is attached to, its creator 
    Staking internal staking;                                            // Staking properties of the minipool to track
    uint256 internal userDepositCapacity;                                // Total capacity for user deposits
    uint256 internal userDepositTotal;                                   // Total value of all assigned user deposits
    uint256 internal stakingUserDepositsWithdrawn;                       // Total value of user deposits withdrawn while staking
    mapping (bytes32 => StakingWithdrawal) internal stakingWithdrawals;  // Information on deposit withdrawals made by users while staking
    bytes32[] internal stakingWithdrawalIDs;

    // Deposits
    mapping (bytes32 => Deposit) internal deposits;                      // Deposits in this pool
    bytes32[] internal depositIDs;                                       // IDs of deposits in this pool for iteration


    /*** Contracts **************/

    ERC20 rplContract = ERC20(0);                                                                   // The address of our RPL ERC20 token contract
    ERC20 rethContract = ERC20(0);                                                                  // The address of our rETH ERC20 token contract
    DepositInterface casperDeposit = DepositInterface(0);                                           // Interface of the Casper deposit contract
    RocketGroupContractInterface rocketGroupContract = RocketGroupContractInterface(0);             // The users group contract that they belong to
    RocketNodeContractInterface rocketNodeContract = RocketNodeContractInterface(0);                // The node contract for the node which owns this minipool
    RocketNodeSettingsInterface rocketNodeSettings = RocketNodeSettingsInterface(0);                // The settings for nodes
    RocketPoolInterface rocketPool = RocketPoolInterface(0);                                        // The main pool manager
    RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(0);    // The main settings contract most global parameters are maintained
    RocketStorageInterface rocketStorage = RocketStorageInterface(0);                               // The main Rocket Pool storage contract where primary persistant storage is maintained
    PublisherInterface publisher = PublisherInterface(0);                                           // Main pubsub system event publisher


    /*** Structs ****************/

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
        uint256 balanceEnd;                                     // rETH balance of this minipool when it completes staking
        bytes   validatorPubkey;                                // Validator pubkey submitted to the casper deposit contract
        bytes   validatorSignature;                             // Validator signature submitted to the casper deposit contract
        bytes32 validatorDepositDataRoot;                       // Validator deposit data SSZ hash tree root submitted to the casper deposit contract
        bytes32 withdrawalCredentials;                          // Withdrawal credentials submitted to the casper deposit contract
    }

    struct Deposit {
        address userID;                                         // Address ID of the user
        address groupID;                                        // Address ID of the user's group
        uint256 balance;                                        // Chunk balance deposited
        uint256 stakingTokensWithdrawn;                         // rETH tokens withdrawn by the user during staking
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


    /*** Modifiers **************/


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


    /*** Methods ****************/

    /// @dev minipool constructor
    constructor(address _rocketStorageAddress) public {
        // Set the storage contract address
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
        // Set the address of the casper deposit contract
        casperDeposit = DepositInterface(getContractAddress("casperDeposit"));
        // Add the token contract addresses
        rplContract = ERC20(getContractAddress("rocketPoolToken"));
        rethContract = ERC20(getContractAddress("rocketETHToken"));
    }


    /// @dev Get the the contracts address - This method should be called before interacting with any RP contracts to ensure the latest address is used
    function getContractAddress(string memory _contractName) internal view returns(address) {
        // Get the current API contract address
        return rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", _contractName)));
    }


}
