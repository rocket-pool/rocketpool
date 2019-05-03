pragma solidity 0.5.8;


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


/// @title The minipool delegate for status methods, should contain all primary logic for methods that minipools use, is entirely upgradable so that currently deployed pools can get any bug fixes or additions - storage here MUST match the minipool contract
/// @author David Rugendyke

contract RocketMinipoolDelegateStatus {

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

    // Users
    mapping (bytes32 => User) private users;                    // Users in this pool
    mapping (bytes32 => bytes32) private userBackupIDs;         // Users backup withdrawal ID => users current ID in this pool, need these in a mapping so we can do a reverse lookup using the backup ID
    bytes32[] private userIDs;                                  // Users in this pool IDs for iteration


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

    struct User {
        address user;                                           // Address of the user
        address groupID;                                        // Address ID of the users group
        address backup;                                         // The backup address of the user
        uint256 balance;                                        // Chunk balance deposited
        uint256 stakingTokensWithdrawn;                         // RPB tokens withdrawn by the user during staking
        uint256 feeRP;                                          // Rocket Pools fee
        uint256 feeGroup;                                       // Group fee
        uint256 created;                                        // Creation timestamp
        bool    exists;                                         // User exists?
        uint256 idIndex;                                        // User's index in the ID list
    }

    struct StakingWithdrawal {
        address groupFeeAddress;                                // The address to send group fees to
        uint256 amount;                                         // The amount withdrawn by the user
        uint256 feeRP;                                          // The fee charged to the user by Rocket Pool
        uint256 feeGroup;                                       // The fee charged to the user by the group
        bool exists;
    }


    /*** Events ****************/


    event PoolDestroyed (
        address indexed _user,                                  // User that triggered the close
        address indexed _address,                               // Address of the pool
        uint256 created                                         // Creation timestamp
    );

    event StatusChange (
        uint256 indexed _statusCodeNew,                         // Pools status code - new
        uint256 indexed _statusCodeOld,                         // Pools status code - old
        uint256 time,                                           // The last time the status changed
        uint256 block                                           // The last block number the status changed
    );


    /*** Modifiers *************/


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


    /// @dev Returns the user count for this pool
    function getUserCount() public view returns(uint256) {
        return userIDs.length;
    }


    /// @dev Change the status
    /// @param _newStatus status id to apply to the minipool
    function setStatus(uint8 _newStatus) private {
        // Fire the event if the status has changed
        if (_newStatus != status.current) {
            status.previous = status.current;
            status.current = _newStatus;
            status.time = now;
            status.block = block.number;
            emit StatusChange(status.current, status.previous, status.time, status.block);
            // Publish status change event
            publisher = PublisherInterface(getContractAddress("utilPublisher"));
            publisher.publish(keccak256("minipool.status.change"), abi.encodeWithSignature("onMinipoolStatusChange(address,uint8)", address(this), _newStatus));
        }
    }


    /// @dev Sets the status of the pool based on its current parameters 
    function updateStatus() public returns(bool) {
        // Set our status now - see RocketMinipoolSettings.sol for pool statuses and keys
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        // Get minipool settings
        uint256 launchAmount = rocketMinipoolSettings.getMinipoolLaunchAmount();
        // Check to see if we can close the pool - stops execution if closed
        closePool();
        // Set to Prelaunch - Minipool has been assigned user(s) ether but not enough to begin staking yet. Node owners cannot withdraw their ether/rpl.
        if (getUserCount() == 1 && status.current == 0) {
            // Prelaunch
            setStatus(1);
            // Done
            return true;
        }
        // Set to Staking - Minipool has received enough ether to begin staking, it's users and node owners ether is combined and sent to stake with Casper for the desired duration. Do not enforce the required ether, just send the right amount.
        if (getUserCount() > 0 && status.current == 1 && address(this).balance >= launchAmount) {
            // If the node is not trusted, double check to make sure it has the correct RPL balance
            if(!node.trusted) {
                require(rplContract.balanceOf(address(this)) >= node.depositRPL, "Nodes RPL balance does not match its intended staking balance.");
            }
            // Send deposit to casper deposit contract
            casperDeposit.deposit.value(launchAmount)(staking.depositInput);
            // Set staking start balance
            staking.balanceStart = launchAmount;
            // Set node user fee
            rocketNodeSettings = RocketNodeSettingsInterface(getContractAddress("rocketNodeSettings"));
            node.userFee = rocketNodeSettings.getFeePerc();
            // Staking
            setStatus(2);
            // Done
            return true;
        }
        // Set to TimedOut - If a minipool is widowed or stuck for a long time, it is classed as timed out (it has users, not enough to begin staking, but the node owner cannot close it)
        if (status.current == 1 && status.time <= (now - rocketMinipoolSettings.getMinipoolTimeout())) {
            // TimedOut
            setStatus(6);
            // Done
            return true;
        }
        // Done
        return true; 
    }


    /// @dev Sets the minipool to logged out
    function logoutMinipool() public onlyLatestContract("rocketNodeWatchtower") returns (bool) {
        // Check current status
        require(status.current == 2, "Minipool may only be logged out while staking");
        // Set LoggedOut status
        setStatus(3);
        // Success
        return true;
    }


    /// @dev Sets the minipool to withdrawn and sets its balance at withdrawal
    /// @param _withdrawalBalance The minipool's balance at withdrawal
    function withdrawMinipool(uint256 _withdrawalBalance) public onlyLatestContract("rocketNodeWatchtower") returns (bool) {
        // Check current status
        require(status.current == 3, "Minipool may only be withdrawn while logged out");
        // Set Withdrawn status
        setStatus(4);
        // Set staking end balance
        staking.balanceEnd = _withdrawalBalance;
        // Success
        return true;
    }


    /// @dev All kids outta the pool - will close and self destruct this pool if the conditions are correct
    function closePool() private {
        // Get the RP interface
        rocketPool = RocketPoolInterface(getContractAddress("rocketPool"));
        // Remove the minipool if possible
        if(rocketPool.minipoolRemove()) {
            // Send any unclaimed RPL back to the node contract
            uint256 rplBalance = rplContract.balanceOf(address(this));
            if (rplBalance > 0) { require(rplContract.transfer(node.contractAddress, rplBalance), "RPL balance transfer error."); }
            // Process fees for forfeited rewards if staking completed
            if (staking.balanceStart > 0 && staking.balanceEnd > 0) {
                // Total node fees
                uint256 nodeFeeTotal = 0;
                // Process staking withdrawals
                for (uint256 i = 0; i < stakingWithdrawalIDs.length; ++i) {
                    StakingWithdrawal memory withdrawal = stakingWithdrawals[stakingWithdrawalIDs[i]];
                    // Calculate rewards forfeited by user
                    int256 rewardsForfeited = int256(withdrawal.amount.mul(staking.balanceEnd).div(staking.balanceStart)) - int256(withdrawal.amount);
                    if (rewardsForfeited > 0) {
                        // Calculate and subtract RP and node fees from rewards
                        uint256 rpFeeAmount = uint256(rewardsForfeited).mul(withdrawal.feeRP).div(calcBase);
                        uint256 nodeFeeAmount = uint256(rewardsForfeited).mul(node.userFee).div(calcBase);
                        nodeFeeTotal = nodeFeeTotal.add(nodeFeeAmount);
                        rewardsForfeited -= int256(rpFeeAmount + nodeFeeAmount);
                        // Calculate group fee from remaining rewards and transfer
                        uint256 groupFeeAmount = uint256(rewardsForfeited).mul(withdrawal.feeGroup).div(calcBase);
                        if (groupFeeAmount > 0) { require(rpbContract.transfer(withdrawal.groupFeeAddress, groupFeeAmount), "Group fee could not be transferred to group contract address"); }
                    }
                }
                // Transfer total node fees
                if (nodeFeeTotal > 0) { require(rpbContract.transfer(rocketNodeContract.getRewardsAddress(), nodeFeeTotal), "Node operator fee could not be transferred to node contract address"); }
            }
            // Transfer remaining RPB balance to rocket pool
            uint256 rpbBalance = rpbContract.balanceOf(address(this));
            if (rpbBalance > 0) {
                rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
                require(rpbContract.transfer(rocketMinipoolSettings.getMinipoolWithdrawalFeeDepositAddress(), rpbBalance), "RPB balance transfer error.");
            }
            // Log it
            emit PoolDestroyed(msg.sender, address(this), now);
            // Close now and send any unclaimed ether back to the node contract
            selfdestruct(address(uint160(node.contractAddress)));
        }
    }


}
