pragma solidity 0.4.18;


import "./contract/Ownable.sol";
import "./interface/RocketStorageInterface.sol";


/// @title Common settings that are used across all spoke contracts, mostly the main rocketpool and the mini pools it creates
/// @author David Rugendyke
contract RocketSettings is Ownable {

    /**** Properties ***********/

    
    uint256 private poolMiniMinWeiRequired;                     // The minimum Ether required for a pool to start staking (go from PreLaunchAcceptingDeposits to PreLaunchCountdown)
    uint256 private poolMiniCountdownTime;                      // The time limit to stay in countdown before staking begins (gives the users a chance to withdraw their Ether incase they change their mind)
    uint256 private poolMiniMinimumStakingTime;                 // The default min required time for staking in weeks, this should match caspers
    mapping (string => uint256) private poolMiniStakingTimes;   // The current staking times for a pool in weeks
    string[] private poolMiniStakingTimesIDs;                   // Keep an array of all our staking times for iteration
    bool    private poolMiniNewAllowed;                         // Are minipools allowed to be created?
    uint256 private poolMiniMaxAllowed;                         // Maximum minipools that are currently allowed
    bool    private poolMiniClosingAllowed;                     // Can minipools be closed?
    uint256 private poolMiniCreationGas;                        // How much gas to assign for potential minipool contract creation 
    uint256 private withdrawalFeePercInWei;                     // The default fee given as a uint256 % of 1 Ether (eg 5% = 0.05 Ether = 50000000000000000 Wei) for withdrawing after a Casper returned deposit, is only taken from the earned rewards/interest (not total deposit)
    address private withdrawalFeeDepositAddress;                // Where the Rocket Pool fee is withdrawn too
    bool    private poolUserBackupCollectEnabled;               // Are user backup addresses allowed to collect on behalf of the user after a certain time limit
    uint256 private poolUserBackupCollectTime;                  // The time limit of which after a deposit is received back from Casper, that the user backup address can get access to the deposit
    uint256 private depositTokenWithdrawalFeePercInWei;         // Deposit Token settings - fee a user is charged on their deposit for an early withdrawal using tokens, given as a uint256 % of 1 Ether (eg 5% = 0.05 Ether = 50000000000000000 Wei)
    uint256 private nodeMinWei;                                 // Miniumum balance a node must have to cover gas costs for smart node services when registered
    uint256 private nodeCheckinGasPrice;                        // Nodes gas price to use when checking in
    bool    private nodeSetInactiveAutomatic;                   // Are nodes allowed to be set inactive by Rocket Pool automatically
    uint256 private nodeSetInactiveDuration;                    // The duration between node checkins to make the node inactive (server failure, DDOS etc) and prevent new pools being assigned to it
    
    // The default status for newly created mini pools
    PoolMiniStatuses public constant MINIPOOL_DEFAULT_STATUS = PoolMiniStatuses.PreLaunchAcceptingDeposits;


    /*** Contracts ***********/

    RocketStorageInterface rocketStorage = RocketStorageInterface(0);     // The main storage contract where primary persistant storage is maintained  
    

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

    event FlagString (
        string flag
    );


    /// @dev RocketSettings constructor
    function RocketSettings(address _rocketStorageAddress) public {
        // Defualt Settings
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);  // Update the storage contract address
        // Pools
        poolMiniMinWeiRequired = 5 ether;                               // The minimum Wei required for a pool to launch
        poolMiniCountdownTime = 5 minutes;                              // The time limit to stay in countdown before staking begins TODO: Change to 1hr
        poolMiniMinimumStakingTime = 8 weeks;                           // This is the minimum time allowed for staking with Casper, looking to be 2 months at this point, but may obviously change at this stage
        setPoolStakingTime("default", poolMiniMinimumStakingTime);      // Set the possible staking times for mini pools
        setPoolStakingTime("medium", 26 weeks);                         // 6 Months
        setPoolStakingTime("long", 1 years);                            // 1 Year
        withdrawalFeePercInWei = 0.05 ether;                            // The default fee given as a % of 1 Ether (eg 5%)
        withdrawalFeeDepositAddress = msg.sender;                       // The account to see Rocket Fees too, must be an account, not a contract address
        poolUserBackupCollectEnabled = true;                            // Are user backup addresses allowed to collect on behalf of the user after a certain time limit
        poolUserBackupCollectTime = 12 weeks;                           // The time limit of which after a deposit is received back from Casper, that the user backup address can get access to the deposit
        poolMiniNewAllowed = true;                                      // Minipools allowed to be created?
        poolMiniMaxAllowed = 50;                                        // Maximum amount of minipool contracts allowed
        poolMiniClosingAllowed = true;                                  // Minipools allowed to be closed?
        poolMiniCreationGas = 4800000;                                  // This is the minipool creation gas, makes a whole new contract, so has to be high (can be optimised also)
        // Deposit token settings
        depositTokenWithdrawalFeePercInWei = 0.05 ether;                // The default fee given as a % of 1 Ether (eg 5%)
        // Node settings
        nodeMinWei = 5 ether;                                           // Set the min eth needed for a node account to cover gas costs
        nodeCheckinGasPrice = 20000000000;                              // Set the gas price for node checkins in Wei
        nodeSetInactiveAutomatic = true;                                // Can nodes be set inactive automatically by the contract
        nodeSetInactiveDuration = 1 hours;                              // The duration needed by a node not checking in to disable it, needs to be manually reanabled when fixed
    }
    
    /// @dev Get default status of a new mini pool
    function getPoolDefaultStatus() public pure returns (uint256) {
        return uint256(MINIPOOL_DEFAULT_STATUS);
    }

    /// @dev Check to see if new pools are allowed to be created
    function getPoolAllowedToBeCreated() public view returns (bool) { 
        // Get the mini pool count
        uint256 miniPoolCount = rocketStorage.getUint(keccak256("minipools.total"));
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
    function getPoolStakingTimeExists(string _stakingTimeID) public view returns (bool) {
        if (poolMiniStakingTimes[_stakingTimeID] >= poolMiniMinimumStakingTime) {
            return true;
        } 
        return false; 
    }

     /// @dev Get staking time length for a given staking time ID, throw if its not a valid ID
    function getPoolStakingTime(string _stakingTimeID) public view returns (uint256) {
        // Make sure the staking ID exists
        require(getPoolStakingTimeExists(_stakingTimeID) == true);
        return poolMiniStakingTimes[_stakingTimeID];
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

    /// @dev Get the gas amount required to create a minipool contract upon deposit
    function getPoolMiniCreationGas() public view returns (uint256) {
        return poolMiniCreationGas;
    }

    /// @dev Get the Rocket Pool post Casper fee given as a % of 1 Ether (eg 5% = 0.05 Ether = 50000000000000000 Wei)
    function getWithdrawalFeePercInWei() public view returns (uint256) {
        return withdrawalFeePercInWei;
    }

    /// @dev Get the Rocket Pool withdrawal fee address (defaults to RocketHub)
    function getWithdrawalFeeDepositAddress() public view returns (address) {
        require(withdrawalFeeDepositAddress != 0);
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

    /// @dev Get the min eth needed for a node account to cover gas costs
    function getNodeMinWei() public view returns (uint256) {
        return nodeMinWei;
    }

    /// @dev Get the gas price for node checkins in Wei
    function getNodeCheckinGasPrice() public view returns (uint256) {
        return nodeCheckinGasPrice;
    }

    /// @dev Are nodes allowed to be set inactive by Rocket Pool automatically
    function getNodeSetInactiveAutomatic() public view returns (bool) {
        return nodeSetInactiveAutomatic;
    }

    /// @dev Get the gas price for node checkins in Wei
    function getNodeSetInactiveDuration() public view returns (uint256) {
        return nodeSetInactiveDuration;
    }

    /// @dev Set the Rocket Pool deposit token withdrawal fee, given as a % of 1 Ether (eg 5% = 0.05 Ether = 50000000000000000 Wei)
    function setDepositTokenWithdrawalFeePercInWei(uint256 _newTokenWithdrawalFeePercInWei) public onlyOwner {
        depositTokenWithdrawalFeePercInWei = _newTokenWithdrawalFeePercInWei;
    }

    /// @dev Set the time limit of which after a deposit is received back from Casper, that the user backup address can get access to the deposit
    function setPoolUserBackupCollectTime(uint256 _newTimeLimit) public onlyOwner {
        poolUserBackupCollectTime = _newTimeLimit;
    }

    /// @dev Set if users backup addressess are allowed to collect
    function setPoolUserBackupCollectEnabled(bool _backupCollectEnabled) public onlyOwner {
        poolUserBackupCollectEnabled = _backupCollectEnabled;
    }

    /// @dev Set the minimum Wei required for a pool to launch
    function setPoolMinEtherRequired(uint256 _weiAmount) public onlyOwner {
        poolMiniMinWeiRequired = _weiAmount;
    }

    /// @dev Set the time limit to stay in countdown before staking begins (eg 5 minutes)
    function setPoolCountdownTime(uint256 _time) public onlyOwner {
        poolMiniCountdownTime = _time;
    }

    /// @dev Set the minimum mini pool staking time
    function setPoolMinStakingTime(uint256 _secondsToSet) public onlyOwner {
        if (_secondsToSet > 0) {
            poolMiniMinimumStakingTime = _secondsToSet;
        }
    }

    /// @dev Set the mini pool staking time
    function setPoolStakingTime(string _id, uint256 _secondsToSet) public onlyOwner {
        poolMiniStakingTimes[_id] = _secondsToSet; 
        poolMiniStakingTimesIDs.push(_id);
    }

    /// @dev Set the mini pool staking time
    function setPoolMiniCreationGas(uint256 _gas) public onlyOwner {
        poolMiniCreationGas = _gas;
    }

    /// @dev Set the Rocket Pool post Casper fee given as a % of 1 Ether (eg 5% = 0.05 Ether = 50000000000000000 Wei)
    function setWithdrawalFeePercInWei(uint256 newWithdrawalFeePercInWei) public onlyOwner {
        withdrawalFeePercInWei = newWithdrawalFeePercInWei;
    }

    /// @dev Set the Rocket Pool withdrawal fee address, must be an account, not a contract address
    function setWithdrawalFeeDepositAddress(address newWithdrawalFeeDepositAddress) public onlyOwner {
        withdrawalFeeDepositAddress = newWithdrawalFeeDepositAddress;
    }
    
    /// @dev Set the min eth needed for a node account to cover gas costs
    function setNodeMinWei(uint256 _nodeMinWei) public onlyOwner {
        nodeMinWei = _nodeMinWei;
    }

    /// @dev Set the gas price for node checkins in Wei
    function setNodeCheckinGasPrice(uint256 _nodeGasCheckinPrice) public onlyOwner {
        nodeCheckinGasPrice = _nodeGasCheckinPrice;
    }

    /// @dev Set if nodes are allowed to be set inactive by Rocket Pool automatically
    function setNodeCheckinGasPrice(bool _nodeSetInactiveAutomatic) public onlyOwner {
        nodeSetInactiveAutomatic = _nodeSetInactiveAutomatic;
    }

    /// @dev Set the gas price for node checkins in Wei
    function setNodeSetInactiveDuration(uint256 _nodeSetInactiveDuration) public onlyOwner {
        nodeSetInactiveDuration = _nodeSetInactiveDuration;
    }


}
