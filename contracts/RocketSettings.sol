pragma solidity ^0.4.17;

import "./contract/Owned.sol";
import "./RocketHub.sol";

/// @title Common settings that are used across all spoke contracts, mostly the main rocketpool and the mini pools it creates
/// @author David Rugendyke

contract RocketSettings is Owned {

    /**** Properties ***********/

    // Address of the main RocketHub contract
    address private rocketHubAddress;
    // The minimum Ether required for a pool to start staking (go from PreLaunchAcceptingDeposits to PreLaunchCountdown)
    uint256 private poolMiniMinWeiRequired;
    // The time limit to stay in countdown before staking begins (gives the users a chance to withdraw their Ether incase they change their mind)
    uint256 private poolMiniCountdownTime;
    // The default min required time for staking in weeks, this should match caspers
    uint256 private poolMiniMinimumStakingTime;
    // The current staking times for a pool in weeks
    mapping (bytes32 => uint256) private poolMiniStakingTimes;
    // Keep an array of all our staking times for iteration
    bytes32[] private poolMiniStakingTimesIDs;
    // General mini pool settings
    bool private poolMiniNewAllowed;
    uint private poolMiniMaxAllowed;
    bool private poolMiniClosingAllowed;
    // The default fee given as a uint256 % of 1 Ether (eg 5% = 0.05 Ether = 50000000000000000 Wei) for withdrawing after a Casper returned deposit, is only taken from the earned rewards/interest (not total deposit)
    // Done this way to take a % fee as a decimal if needed (eg 5.5%) since solidity doesn't support reals yet
    uint256 private withdrawalFeePercInWei;
    address private withdrawalFeeDepositAddress;
    // Are user backup addresses allowed to collect on behalf of the user after a certain time limit
    bool poolUserBackupCollectEnabled;
    // The time limit of which after a deposit is received back from Casper, that the user backup address can get access to the deposit
    uint256 poolUserBackupCollectTime;
    // Deposit Token settings - fee a user is charged on their deposit for an early withdrawal using tokens, given as a uint256 % of 1 Ether (eg 5% = 0.05 Ether = 50000000000000000 Wei)
    uint256 private depositTokenWithdrawalFeePercInWei;
    // The default status for newly created mini pools
    PoolMiniStatuses public constant poolMiniDefaultStatus = PoolMiniStatuses.PreLaunchAcceptingDeposits;
    

    /*** Enums ***************/

    // Pool statuses are defined here and converted to uint when setting, their corresponding uint value is commented below
    enum PoolMiniStatuses { 
        PreLaunchAcceptingDeposits, // 0 - Accepting deposits for the pool, users can deposit multiple times and it will update their balance
        PreLaunchCountdown,         // 1 - The minimum required for this pool to start staking has been met and the countdown to start staking has started, users can withdraw their deposit if they change their mind during this time but cannot deposit more
        Staking,                    // 2 - The countdown has passed and the pool is now staking, users cannot deposit or withdraw until the minimum staking period has passed for their pool
        WithdrawalRequested,        // 3 - The pool has now requested withdrawl from the casper validator contract, it will stay in this status until it can withdraw
        Withdrawalcompleted,        // 4 - The pool has now received its deposit +rewards || -penalties from the Casper contract and users can withdraw
        Closed                      // 5 - Pool has had all its balance withdrawn by its users and no longer contains any users or balance
    }


    /// @dev RocketSettings constructor
    function RocketSettings(address currentRocketHubAddress) public {
        // Address of the main RocketHub contract, should never need updating
        rocketHubAddress = currentRocketHubAddress;
        // The minimum Wei required for a pool to launch
        poolMiniMinWeiRequired = 5 ether;
        // The time limit to stay in countdown before staking begins
        poolMiniCountdownTime = 5 minutes; // TODO: Change to 1hr
        // This is the minimum time allowed for staking with Casper, looking to be 2 months at this point, but may obviously change at this stage
        poolMiniMinimumStakingTime = 8 weeks;
        // Set the possible staking times for mini pools
        setPoolStakingTime(keccak256("default"), poolMiniMinimumStakingTime);
        setPoolStakingTime(keccak256("medium"), 26 weeks); // 6 Months
        setPoolStakingTime(keccak256("long"), 1 years); // 1 Years
        // The default fee given as a % of 1 Ether (eg 5%)
        withdrawalFeePercInWei = 0.05 ether;
        // The account to see Rocket Fees too, must be an account, not a contract address
        withdrawalFeeDepositAddress = msg.sender;
        // Are user backup addresses allowed to collect on behalf of the user after a certain time limit
        poolUserBackupCollectEnabled = true;
        // The time limit of which after a deposit is received back from Casper, that the user backup address can get access to the deposit
        poolUserBackupCollectTime = 12 weeks;
        // General settings
        poolMiniNewAllowed = true;
        poolMiniMaxAllowed = 50;
        poolMiniClosingAllowed = true;
        // Deposit token settings
        // The default fee given as a % of 1 Ether (eg 5%)
        depositTokenWithdrawalFeePercInWei = 0.05 ether;
    }
    

    /// @dev Get the address of the main hub contract
    function getRocketHubAddress() public view returns (address) {
        return rocketHubAddress;
    }

    /// @dev Get default status of a new mini pool
    function getPoolDefaultStatus() public pure returns (uint256) {
        return uint256(poolMiniDefaultStatus);
    }

    /// @dev Check to see if new pools are allowed to be created
    function getPoolAllowedToBeCreated() public view returns (bool) { 
        // Get the mini pool count
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        uint256 miniPoolCount = rocketHub.getRocketMiniPoolCount();
        // New pools allowed to be created?
        if (!poolMiniNewAllowed || miniPoolCount >= poolMiniMaxAllowed) {
            return false;
        } 
        return true;
    }

    /// @dev Existing mini pools are allowed to be closed and selfdestruct when finished
    function getPoolAllowedToBeClosed() public view returns (bool) { 
        return poolMiniClosingAllowed;
    }

    /// @dev Check to see if the supplied staking time is a set time
    function getPoolStakingTimeExists(bytes32 stakingTimeID) public view returns (bool) {
        if (poolMiniStakingTimes[stakingTimeID] >= poolMiniMinimumStakingTime) {
            return true;
        }
        return false; 
    }

     /// @dev Get staking time length for a given staking time ID, throw if its not a valid ID
    function getPoolStakingTime(bytes32 stakingTimeID) public view returns (uint256) {
        // Make sure the staking ID exists
        assert(getPoolStakingTimeExists(stakingTimeID) == true);
        return poolMiniStakingTimes[stakingTimeID];
    }

    /// @dev Get the minimum required time for staking
    function getPoolMiniMinimumStakingTime() public view returns (uint256) {
        return poolMiniMinimumStakingTime;
    }

    /// @dev Get the minimum time allowed for staking with Casper
    function getPoolMinEtherRequired() public view returns (uint256) {
        return poolMiniMinWeiRequired;
    }

    /// @dev Get the time limit to stay in countdown before staking begins
    function getPoolCountdownTime() public view returns (uint256) {
        return poolMiniCountdownTime;
    }

    /// @dev Get the Rocket Pool post Casper fee given as a % of 1 Ether (eg 5% = 0.05 Ether = 50000000000000000 Wei)
    function getWithdrawalFeePercInWei() public view returns (uint256) {
        return withdrawalFeePercInWei;
    }

    /// @dev Get the Rocket Pool withdrawal fee address (defaults to RocketHub)
    function getWithdrawalFeeDepositAddress() public view returns (address) {
        assert(withdrawalFeeDepositAddress != 0);
        return withdrawalFeeDepositAddress;
    }

    /// @dev Are user backup addresses allowed to collect on behalf of the user after a certain time limit
    function getPoolUserBackupCollectEnabled() public view returns (bool) {
        return poolUserBackupCollectEnabled;
    }

    /// @dev The time limit of which after a deposit is received back from Casper, that the user backup address can get access to the deposit
    function getPoolUserBackupCollectTime() public view returns (uint256) {
        return poolUserBackupCollectTime;
    }

    /// @dev The Rocket Pool deposit token withdrawal fee, given as a % of 1 Ether (eg 5% = 0.05 Ether = 50000000000000000 Wei)
    function getDepositTokenWithdrawalFeePercInWei() public view returns (uint256) {
        return depositTokenWithdrawalFeePercInWei;
    }

    /// @dev Set the Rocket Pool deposit token withdrawal fee, given as a % of 1 Ether (eg 5% = 0.05 Ether = 50000000000000000 Wei)
    function setDepositTokenWithdrawalFeePercInWei(uint256 newTokenWithdrawalFeePercInWei) public onlyOwner {
        depositTokenWithdrawalFeePercInWei = newTokenWithdrawalFeePercInWei;
    }

    /// @dev Set the time limit of which after a deposit is received back from Casper, that the user backup address can get access to the deposit
    function setPoolUserBackupCollectTime(uint256 newTimeLimit) public onlyOwner {
        poolUserBackupCollectTime = newTimeLimit;
    }

    /// @dev Set if users backup addressess are allowed to collect
    function setPoolUserBackupCollectEnabled(bool backupCollectEnabled) public onlyOwner {
        poolUserBackupCollectEnabled = backupCollectEnabled;
    }

    /// @dev Set the minimum Wei required for a pool to launch
    function setPoolMinEtherRequired(uint256 weiAmount) public onlyOwner {
        poolMiniMinWeiRequired = weiAmount;
    }

    /// @dev Set the time limit to stay in countdown before staking begins (eg 5 minutes)
    function setPoolCountdownTime(uint256 time) public onlyOwner {
        poolMiniCountdownTime = time;
    }

    /// @dev Set the minimum mini pool staking time
    function setPoolMinStakingTime(uint256 secondsToSet) public onlyOwner {
        if (secondsToSet > 0) {
            poolMiniMinimumStakingTime = secondsToSet;
        }
    }

    /// @dev Set the mini pool staking time
    function setPoolStakingTime(bytes32 id, uint256 secondsToSet) public onlyOwner {
        poolMiniStakingTimes[id] = secondsToSet; 
        poolMiniStakingTimesIDs.push(id);
    }

    /// @dev Set the Rocket Pool post Casper fee given as a % of 1 Ether (eg 5% = 0.05 Ether = 50000000000000000 Wei)
    function setWithdrawalFeePercInWei(uint256 newWithdrawalFeePercInWei) public onlyOwner {
        withdrawalFeePercInWei = newWithdrawalFeePercInWei;
    }

    /// @dev Set the Rocket Pool withdrawal fee address, must be an account, not a contract address
    function setWithdrawalFeeDepositAddress(address newWithdrawalFeeDepositAddress) public onlyOwner {
        withdrawalFeeDepositAddress = newWithdrawalFeeDepositAddress;
    }
    
   


}
