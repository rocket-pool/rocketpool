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


/// @title The minipool delegate for user methods, should contain all primary logic for methods that minipools use, is entirely upgradable so that currently deployed pools can get any bug fixes or additions - storage here MUST match the minipool contract
/// @author David Rugendyke

contract RocketMinipoolDelegateUser {

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


    event PoolTransfer (
        address indexed _from,                                  // Transferred from 
        address indexed _to,                                    // Transferred to
        bytes32 indexed _typeOf,                                // Cant have strings indexed due to unknown size, must use a fixed type size and convert string to keccak256
        uint256 value,                                          // Value of the transfer
        uint256 balance,                                        // Balance of the transfer
        uint256 created                                         // Creation timestamp
    );
    
    event UserAdded (
        address indexed _user,                                  // Users address
        uint256 created                                         // Creation timestamp
    );

    event UserRemoved (
        address indexed _user,                                  // Users address
        uint256 created                                         // Creation timestamp
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


    /*** User methods ********/


    /// @dev Deposit a users ether to this contract. Will register the user if they don't exist in this contract already.
    /// @param _user New user address
    /// @param _groupID The 3rd party group the user belongs too
    function deposit(address _user, address _groupID) public payable onlyLatestContract("rocketDepositQueue") returns(bool) {
        // Add this user if they are not currently in this minipool
        addUser(_user, _groupID);
        // Make sure we are accepting deposits
        require(status.current == 0 || status.current == 1, "Minipool is not currently allowing deposits.");
        // Add to their balance
        users[_user].balance = users[_user].balance.add(msg.value);
        // Update total user deposit balance
        userDepositTotal = userDepositTotal.add(msg.value);
        // Publish deposit event
        publisher = PublisherInterface(getContractAddress("utilPublisher"));
        publisher.publish(keccak256("minipool.user.deposit"), abi.encodeWithSignature("onMinipoolUserDeposit(string,uint256)", staking.id, msg.value));
        // All good? Fire the event for the new deposit
        emit PoolTransfer(msg.sender, address(this), keccak256("deposit"), msg.value, users[_user].balance, now);
        // Update the status
        RocketMinipoolInterface minipool = RocketMinipoolInterface(address(this));
        minipool.updateStatus();
        // Success
        return true;
    }

    /// @dev Refund a user's deposit and remove them from this contract (if minipool stalled).
    /// @param _user User address
    /// @param _groupID The 3rd party group the user belongs to
    /// @param _refundAddress The address to refund the user's deposit to
    function refund(address _user, address _groupID, address _refundAddress) public onlyLatestContract("rocketDeposit") returns(bool) {
        // Check current status
        require(status.current == 6, "Minipool is not currently allowing refunds.");
        // Check user address, group ID and balance
        require(users[_user].exists, "User does not exist in minipool.");
        require(users[_user].groupID == _groupID, "User does not exist in group.");
        require(users[_user].balance > 0, "User does not have remaining balance in minipool.");
        // Get remaining balance as refund amount
        uint256 amount = users[_user].balance;
        // Update total user deposit balance
        userDepositTotal = userDepositTotal.sub(amount);
        // Remove user
        removeUser(_user);
        // Transfer refund amount to refund address
        (bool success,) = _refundAddress.call.value(amount)("");
        require(success, "Refund amount could not be transferred to refund address");
        // Publish refund event
        publisher = PublisherInterface(getContractAddress("utilPublisher"));
        publisher.publish(keccak256("minipool.user.refund"), abi.encodeWithSignature("onMinipoolUserRefund(string,uint256)", staking.id, amount));
        // All good? Fire the event for the refund
        emit PoolTransfer(address(this), _refundAddress, keccak256("refund"), amount, 0, now);
        // Update the status
        RocketMinipoolInterface minipool = RocketMinipoolInterface(address(this));
        minipool.updateStatus();
        // Success
        return true;
    }

    /// @dev Withdraw some amount of a user's deposit as RPB tokens, forfeiting rewards for that amount, and remove them if entire deposit is withdrawn (if minipool staking).
    /// @param _user User address
    /// @param _groupID The 3rd party group the user belongs to
    /// @param _withdrawnAmount The amount of the user's deposit withdrawn
    /// @param _tokenAmount The amount of RPB tokens withdrawn
    /// @param _withdrawnAddress The address the user's deposit was withdrawn to
    function withdrawStaking(address _user, address _groupID, uint256 _withdrawnAmount, uint256 _tokenAmount, address _withdrawnAddress) public onlyLatestContract("rocketDeposit") returns(bool) {
        // Check current status
        require(status.current == 2 || status.current == 3, "Minipool is not currently allowing early withdrawals.");
        // Check user address, group ID and withdrawn amount
        require(users[_user].exists, "User does not exist in minipool.");
        require(users[_user].groupID == _groupID, "User does not exist in group.");
        require(users[_user].balance >= _withdrawnAmount, "Insufficient balance for withdrawal.");
        // Update total user deposits withdrawn while staking
        stakingUserDepositsWithdrawn = stakingUserDepositsWithdrawn.add(_withdrawnAmount);
        // Update staking deposit withdrawal info
        stakingUserDepositsWithdrawals.push(StakingWithdrawal({
            groupID: _groupID,
            amount: _withdrawnAmount,
            groupFee: users[_user].feeGroup
        }));
        // Decrement user's balance
        users[_user].balance = users[_user].balance.sub(_withdrawnAmount);
        // Increment user's deposit token balance
        users[_user].stakingTokensWithdrawn = users[_user].stakingTokensWithdrawn.add(_tokenAmount);
        // Remove user if balance depleted
        if (users[_user].balance == 0) { removeUser(_user); }
        // Publish withdrawal event
        publisher = PublisherInterface(getContractAddress("utilPublisher"));
        publisher.publish(keccak256("minipool.user.withdraw"), abi.encodeWithSignature("onMinipoolUserWithdraw(string,uint256)", staking.id, _withdrawnAmount));
        // All good? Fire the event for the withdrawal
        emit PoolTransfer(address(this), _withdrawnAddress, keccak256("withdrawal"), _withdrawnAmount, 0, now);
        // Update the status
        RocketMinipoolInterface minipool = RocketMinipoolInterface(address(this));
        minipool.updateStatus();
        // Success
        return true;
    }

    /// @dev Withdraw a user's deposit as RPB tokens and remove them from this contract (if minipool withdrawn).
    /// @param _user User address
    /// @param _groupID The 3rd party group the user belongs to
    /// @param _withdrawalAddress The address to withdraw the user's deposit to
    function withdraw(address _user, address _groupID, address _withdrawalAddress) public onlyLatestContract("rocketDeposit") returns(bool) {
        // Check current status
        require(status.current == 4, "Minipool is not currently allowing withdrawals.");
        // Check user address, group ID and balance
        require(users[_user].exists, "User does not exist in minipool.");
        require(users[_user].groupID == _groupID, "User does not exist in group.");
        require(users[_user].balance > 0, "User does not have remaining balance in minipool.");
        // Get contracts
        publisher = PublisherInterface(getContractAddress("utilPublisher"));
        // Calculate rewards earned by user
        int256 rewardsEarned = int256(users[_user].balance.mul(staking.balanceEnd).div(staking.balanceStart)) - int256(users[_user].balance);
        // Withdrawal amount
        uint256 amount = uint256(int256(users[_user].balance) + rewardsEarned);
        // Pay fees if rewards were earned
        if (rewardsEarned > 0) {
            // Get the settings
            rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
            // Get fee amounts
            uint256 rpFeeAmount = uint256(rewardsEarned).mul(users[_user].feeRP).div(calcBase);
            uint256 nodeFeeAmount = uint256(rewardsEarned).mul(node.userFee).div(calcBase);
            uint256 groupFeeAmount = uint256(rewardsEarned).mul(users[_user].feeGroup).div(calcBase);
            amount = amount.sub(rpFeeAmount).sub(nodeFeeAmount).sub(groupFeeAmount);
            // Transfer fees
            require(rpbContract.transfer(rocketMinipoolSettings.getMinipoolWithdrawalFeeDepositAddress(), rpFeeAmount), "Rocket Pool fee could not be transferred to RP fee address");
            require(rpbContract.transfer(node.contractAddress, nodeFeeAmount), "Node operator fee could not be transferred to node contract address");
            require(rpbContract.transfer(_groupID, groupFeeAmount), "Group fee could not be transferred to group contract address");
        }
        // Transfer withdrawal amount to withdrawal address as RPB tokens
        require(rpbContract.transfer(_withdrawalAddress, amount), "Withdrawal amount could not be transferred to withdrawal address");
        // Remove user
        removeUser(_user);
        // Publish withdrawal event
        publisher.publish(keccak256("minipool.user.withdraw"), abi.encodeWithSignature("onMinipoolUserWithdraw(string,uint256)", staking.id, amount));
        // All good? Fire the event for the withdrawal
        emit PoolTransfer(address(this), _withdrawalAddress, keccak256("withdrawal"), amount, 0, now);
        // Update the status
        RocketMinipoolInterface minipool = RocketMinipoolInterface(address(this));
        minipool.updateStatus();
        // Success
        return true;
    }

    /// @dev Register a new user in the minipool
    /// @param _user New user address
    /// @param _groupID The 3rd party group address the user belongs too
    function addUser(address _user, address _groupID) private returns(bool) {
        // Address exists?
        require(_user != address(0x0), "User address invalid.");
        // Get the users group contract 
        rocketGroupContract = RocketGroupContractInterface(_groupID);
        // Check the user isn't already registered
        if (users[_user].exists == false) {
            // Add the new user to the mapping of User structs
            users[_user] = User({
                user: _user,
                backup: address(0x0),
                groupID: _groupID,
                balance: 0,
                rewards: 0,
                stakingTokensWithdrawn: 0,
                feeRP: rocketGroupContract.getFeePercRocketPool(),
                feeGroup: rocketGroupContract.getFeePerc(),
                exists: true,
                created: now,
                addressIndex: userAddresses.length
            });
            // Store our user address so we can iterate over it if needed
            userAddresses.push(_user);
            // Fire the event
            emit UserAdded(_user, now);
            // Update the status of the pool
            RocketMinipoolInterface minipool = RocketMinipoolInterface(address(this));
            minipool.updateStatus();
            // Success
            return true;
        }
        return false;
    }

    /// @dev Remove a user from the minipool
    /// @param _user User address
    function removeUser(address _user) private returns(bool) {
        // Check user exists
        require(users[_user].exists, "User does not exist in minipool.");
        // Remove user from address list
        uint256 currentUserIndex = users[_user].addressIndex;
        uint256 lastUserIndex = userAddresses.length - 1;
        users[userAddresses[lastUserIndex]].addressIndex = currentUserIndex;
        userAddresses[currentUserIndex] = userAddresses[lastUserIndex];
        userAddresses.length--;
        // Delete user
        delete users[_user];
        // Fire the event
        emit UserRemoved(_user, now);
        // Update the status of the pool
        RocketMinipoolInterface minipool = RocketMinipoolInterface(address(this));
        minipool.updateStatus();
        // Success
        return true;
    }


}
