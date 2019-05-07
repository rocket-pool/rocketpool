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


/// @title The minipool delegate for deposit methods, should contain all primary logic for methods that minipools use, is entirely upgradable so that currently deployed pools can get any bug fixes or additions - storage here MUST match the minipool contract
/// @author David Rugendyke

contract RocketMinipoolDelegateDeposit {

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


    event PoolTransfer (
        address indexed _from,                                  // Transferred from 
        address indexed _to,                                    // Transferred to
        bytes32 indexed _typeOf,                                // Cant have strings indexed due to unknown size, must use a fixed type size and convert string to keccak256
        uint256 value,                                          // Value of the transfer
        uint256 balance,                                        // Balance of the transfer
        uint256 created                                         // Creation timestamp
    );
    
    event DepositAdded (
        bytes32 indexed _depositID,                             // Deposit ID
        address indexed _user,                                  // Users address
        address indexed _group,                                 // Group ID
        uint256 created                                         // Creation timestamp
    );

    event DepositRemoved (
        bytes32 indexed _depositID,                             // Deposit ID
        address indexed _user,                                  // Users address
        address indexed _group,                                 // Group ID
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


    /*** Deposit methods ********/


    /// @dev Deposit a user's ether to this contract. Will register the deposit if it doesn't exist in this contract already.
    /// @param _depositID The ID of the deposit
    /// @param _userID New user address
    /// @param _groupID The 3rd party group the user belongs to
    function deposit(bytes32 _depositID, address _userID, address _groupID) public payable onlyLatestContract("rocketDepositQueue") returns(bool) {
        // Make sure we are accepting deposits
        require(status.current == 0 || status.current == 1, "Minipool is not currently allowing deposits.");
        // Add this deposit if it is not currently in this minipool
        addDeposit(_depositID, _userID, _groupID);
        // Update deposit balance
        deposits[_depositID].balance = deposits[_depositID].balance.add(msg.value);
        // Update total user deposit balance
        userDepositTotal = userDepositTotal.add(msg.value);
        // Publish deposit event
        publisher = PublisherInterface(getContractAddress("utilPublisher"));
        publisher.publish(keccak256("minipool.user.deposit"), abi.encodeWithSignature("onMinipoolUserDeposit(string,uint256)", staking.id, msg.value));
        // All good? Fire the event for the new deposit
        emit PoolTransfer(msg.sender, address(this), keccak256("deposit"), msg.value, deposits[_depositID].balance, now);
        // Update the status
        RocketMinipoolInterface minipool = RocketMinipoolInterface(address(this));
        minipool.updateStatus();
        // Success
        return true;
    }

    /// @dev Refund a deposit and remove it from this contract (if minipool stalled).
    /// @param _depositID The ID of the deposit
    /// @param _refundAddress The address to refund the deposit to
    function refund(bytes32 _depositID, address _refundAddress) public onlyLatestContract("rocketDeposit") returns(bool) {
        // Check current status
        require(status.current == 6, "Minipool is not currently allowing refunds.");
        // Check deposit ID and balance
        require(deposits[_depositID].exists, "Deposit does not exist in minipool.");
        require(deposits[_depositID].balance > 0, "Deposit does not have remaining balance in minipool.");
        // Get remaining balance as refund amount
        uint256 amount = deposits[_depositID].balance;
        // Update total user deposit balance
        userDepositTotal = userDepositTotal.sub(amount);
        // Remove deposit
        removeDeposit(_depositID);
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

    /// @dev Withdraw some amount of a deposit as RPB tokens, forfeiting rewards for that amount, and remove it if the entire deposit is withdrawn (if minipool staking).
    /// @param _depositID The ID of the deposit
    /// @param _withdrawnAmount The amount of the deposit withdrawn
    /// @param _tokenAmount The amount of RPB tokens withdrawn
    /// @param _withdrawnAddress The address the deposit was withdrawn to
    function withdrawStaking(bytes32 _depositID, uint256 _withdrawnAmount, uint256 _tokenAmount, address _withdrawnAddress) public onlyLatestContract("rocketDeposit") returns(bool) {
        // Check current status
        require(status.current == 2 || status.current == 3, "Minipool is not currently allowing early withdrawals.");
        // Check deposit ID and withdrawn amount
        require(deposits[_depositID].exists, "Deposit does not exist in minipool.");
        require(deposits[_depositID].balance >= _withdrawnAmount, "Insufficient balance for withdrawal.");
        // Get contracts
        rocketGroupContract = RocketGroupContractInterface(deposits[_depositID].groupID);
        // Update total user deposits withdrawn while staking
        stakingUserDepositsWithdrawn = stakingUserDepositsWithdrawn.add(_withdrawnAmount);
        // Update staking deposit withdrawal info
        if (!stakingWithdrawals[_depositID].exists) {
            stakingWithdrawals[_depositID] = StakingWithdrawal({
                groupFeeAddress: rocketGroupContract.getFeeAddress(),
                amount: 0,
                feeRP: deposits[_depositID].feeRP,
                feeGroup: deposits[_depositID].feeGroup,
                exists: true
            });
            stakingWithdrawalIDs.push(_depositID);
        }
        stakingWithdrawals[_depositID].amount = stakingWithdrawals[_depositID].amount.add(_withdrawnAmount);
        // Decrement deposit balance
        deposits[_depositID].balance = deposits[_depositID].balance.sub(_withdrawnAmount);
        // Increment deposit tokens withdrawn balance
        deposits[_depositID].stakingTokensWithdrawn = deposits[_depositID].stakingTokensWithdrawn.add(_tokenAmount);
        // Remove deposit if balance depleted
        if (deposits[_depositID].balance == 0) { removeDeposit(_depositID); }
        // Publish withdrawal event
        publisher = PublisherInterface(getContractAddress("utilPublisher"));
        publisher.publish(keccak256("minipool.user.withdraw"), abi.encodeWithSignature("onMinipoolUserWithdraw(string,uint256)", staking.id, _withdrawnAmount));
        // All good? Fire the event for the withdrawal
        emit PoolTransfer(address(this), _withdrawnAddress, keccak256("withdrawal"), _withdrawnAmount, deposits[_depositID].balance, now);
        // Update the status
        RocketMinipoolInterface minipool = RocketMinipoolInterface(address(this));
        minipool.updateStatus();
        // Success
        return true;
    }

    /// @dev Withdraw a deposit as RPB tokens and remove it from this contract (if minipool withdrawn).
    /// @param _depositID The ID of the deposit
    /// @param _withdrawalAddress The address to withdraw the deposit to
    function withdraw(bytes32 _depositID, address _withdrawalAddress) public onlyLatestContract("rocketDeposit") returns(bool) {
        // Check current status
        require(status.current == 4, "Minipool is not currently allowing withdrawals.");
        require(staking.balanceStart > 0, "Invalid balance at staking start");
        // Check deposit ID and balance
        require(deposits[_depositID].exists, "Deposit does not exist in minipool.");
        require(deposits[_depositID].balance > 0, "Deposit does not have remaining balance in minipool.");
        // Get contracts
        publisher = PublisherInterface(getContractAddress("utilPublisher"));
        // Calculate rewards earned by deposit
        int256 rewardsEarned = int256(deposits[_depositID].balance.mul(staking.balanceEnd).div(staking.balanceStart)) - int256(deposits[_depositID].balance);
        // Withdrawal amount
        uint256 amount = uint256(int256(deposits[_depositID].balance) + rewardsEarned);
        // Pay fees if rewards were earned
        if (rewardsEarned > 0) {
            // Get contracts
            rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
            rocketGroupContract = RocketGroupContractInterface(deposits[_depositID].groupID);
            // Calculate and subtract RP and node fees from rewards
            uint256 rpFeeAmount = uint256(rewardsEarned).mul(deposits[_depositID].feeRP).div(calcBase);
            uint256 nodeFeeAmount = uint256(rewardsEarned).mul(node.userFee).div(calcBase);
            rewardsEarned -= int256(rpFeeAmount + nodeFeeAmount);
            // Calculate group fee from remaining rewards
            uint256 groupFeeAmount = uint256(rewardsEarned).mul(deposits[_depositID].feeGroup).div(calcBase);
            // Update withdrawal amount
            amount = amount.sub(rpFeeAmount).sub(nodeFeeAmount).sub(groupFeeAmount);
            // Transfer fees
            if (rpFeeAmount > 0) { require(rpbContract.transfer(rocketMinipoolSettings.getMinipoolWithdrawalFeeDepositAddress(), rpFeeAmount), "Rocket Pool fee could not be transferred to RP fee address"); }
            if (nodeFeeAmount > 0) { require(rpbContract.transfer(rocketNodeContract.getRewardsAddress(), nodeFeeAmount), "Node operator fee could not be transferred to node contract address"); }
            if (groupFeeAmount > 0) { require(rpbContract.transfer(rocketGroupContract.getFeeAddress(), groupFeeAmount), "Group fee could not be transferred to group contract address"); }
        }
        // Transfer withdrawal amount to withdrawal address as RPB tokens
        if (amount > 0) { require(rpbContract.transfer(_withdrawalAddress, amount), "Withdrawal amount could not be transferred to withdrawal address"); }
        // Remove deposit
        removeDeposit(_depositID);
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

    /// @dev Register a new deposit in the minipool
    /// @param _depositID The ID of the deposit
    /// @param _userID New user address
    /// @param _groupID The 3rd party group address the user belongs to
    function addDeposit(bytes32 _depositID, address _userID, address _groupID) private returns(bool) {
        // Check user and group IDs
        require(_userID != address(0x0), "Invalid user ID.");
        require(_groupID != address(0x0), "Invalid group ID.");
        // Get the user's group contract 
        rocketGroupContract = RocketGroupContractInterface(_groupID);
        // Check the deposit isn't already registered
        if (deposits[_depositID].exists == false) {
            // Add the new deposit to the mapping of Deposit structs
            deposits[_depositID] = Deposit({
                userID: _userID,
                groupID: _groupID,
                balance: 0,
                stakingTokensWithdrawn: 0,
                feeRP: rocketGroupContract.getFeePercRocketPool(),
                feeGroup: rocketGroupContract.getFeePerc(),
                created: now,
                exists: true,
                idIndex: depositIDs.length
            });
            // Store our deposit ID so we can iterate over it if needed
            depositIDs.push(_depositID);
            // Fire the event
            emit DepositAdded(_depositID, _userID, _groupID, now);
            // Success
            return true;
        }
        return false;
    }

    /// @dev Remove a deposit from the minipool
    /// @param _depositID The ID of the deposit
    function removeDeposit(bytes32 _depositID) private returns(bool) {
        // Check deposit exists
        require(deposits[_depositID].exists, "Deposit does not exist in minipool.");
        // Get deposit details
        address userID = deposits[_depositID].userID;
        address groupID = deposits[_depositID].groupID;
        // Remove deposit from ID list
        uint256 currentDepositIndex = deposits[_depositID].idIndex;
        uint256 lastDepositIndex = depositIDs.length - 1;
        deposits[depositIDs[lastDepositIndex]].idIndex = currentDepositIndex;
        depositIDs[currentDepositIndex] = depositIDs[lastDepositIndex];
        depositIDs.length--;
        // Delete deposit
        delete deposits[_depositID];
        // Fire the event
        emit DepositRemoved(_depositID, userID, groupID, now);
        // Success
        return true;
    }


}
