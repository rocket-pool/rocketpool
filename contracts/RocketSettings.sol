pragma solidity 0.4.18;


import "./contract/Ownable.sol";
import "./interface/CasperInterface.sol";
import "./interface/RocketStorageInterface.sol";


/// @title Common settings that are used across all spoke contracts, mostly the main rocketpool and the mini pools it creates
/// @author David Rugendyke
contract RocketSettings is Ownable {

     /*** Contracts ***********/

    CasperInterface casper = CasperInterface(0);                            // The interface for Casper
    RocketStorageInterface rocketStorage = RocketStorageInterface(0);       // The main storage contract where primary persistant storage is maintained  

    /**** Properties ***********/   
   
    PoolMiniStatuses public constant MINIPOOL_DEFAULT_STATUS = PoolMiniStatuses.PreLaunchAcceptingDeposits;


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
    function RocketSettings(address _rocketStorageAddress) public {
        
        /*** Contracts */
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);     
        
        /*** Minipools */
        setMiniPoolDefaultStatus(uint256(PoolMiniStatuses.PreLaunchAcceptingDeposits));     // The default status for newly created mini pools
        setMiniPoolLaunchWei(5 ether);                                                      // The minimum Wei required for a pool to launch
        setMiniPoolCountDownTime(1 hours);                                                  // The time limit to stay in countdown before staking begins
        setMiniPoolStakingTime("short", 12 weeks);                                          // Set the possible staking times for minipools in days, 3 months (the withdrawal time from Casper is added onto this, it is not included) 
        setMiniPoolStakingTime("medium", 26 weeks);                                         // 6 Months
        setMiniPoolStakingTime("long", 52 weeks);                                           // 12 Months
        setMiniPoolWithdrawalFeePerc(0.05 ether);                                           // The default fee given as a % of 1 Ether (eg 5%)    
        setMiniPoolWithdrawalFeeDepositAddress(msg.sender);                                 // The account to send Rocket Pool Fees too, must be an account, not a contract address
        setMiniPoolBackupCollectEnabled(true);                                              // Are user backup addresses allowed to collect on behalf of the user after a certain time limit
        setMiniPoolBackupCollectTime(12 weeks);                                             // The time limit of which after a deposit is received back from Casper, that the user backup address can get access to the deposit
        setMiniPoolNewEnabled(true);                                                        // Minipools allowed to be created?
        setMiniPoolClosingEnabled(true);                                                    // Minipools allowed to be closed?
        setMiniPoolMax(20);                                                                 // Maximum amount of minipool contracts allowed
        setMiniPoolNewGas(4800000);                                                         // This is the minipool creation gas, makes a whole new contract, so has to be high (can be optimised also)
        setMiniPoolDepositGas(400000);                                                      // The gas required for depositing with Casper and being added as a validator

        /*** RPL and RPD Tokens */
        setTokenRPDWithdrawalFeePerc(0.05 ether);                                           // The default fee given as a % of 1 Ether (eg 5%)

        /*** Smart Nodes */                                            
        setSmartNodeEtherMin(5 ether);                                                      // Set the min eth needed for a node coinbase account to cover gas costs associated with checkins
        setSmartNodeCheckinGas(20000000000);                                                // Set the gas price for node checkins in Wei (20 gwei)
        setSmartNodeSetInactiveAutomatic(true);                                             // Can nodes be set inactive automatically by the contract? they won't receive new users
        setSmartNodeSetInactiveDuration(1 hours);                                           // The duration needed by a node not checking in to disable it, needs to be manually reanabled when fixed

    }


    /*** Getters *****************/

    /// @dev Get the current average block time for the network
    function getAverageBlockTime() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.network.blocktime"));
    }
    
    /// @dev Get default status of a new mini pool
    function getPoolDefaultStatus() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.minipool.status.default"));
    }

    /// @dev The minimum Wei required for a pool to launch
    function getMiniPoolLaunchWei() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.minipool.launch.wei"));
    }

    /// @dev The time limit to stay in countdown before staking begins
    function getMiniPoolCountDownTime() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.minipool.countdown.time"));
    }
    
    /// @dev Check to see if new pools are allowed to be created
    function getPoolAllowedToBeCreated() public view returns (bool) { 
        // Get the mini pool count
        uint256 miniPoolCount = rocketStorage.getUint(keccak256("minipools.total"));
        // New pools allowed to be created?
        if (!getMiniPoolNewEnabled() || miniPoolCount >= getMiniPoolMax()) {
            return false;
        }
        return true;
    }

    /// @dev Minipools allowed to be created?
    function getMiniPoolNewEnabled() public view returns (bool) {
        return rocketStorage.getBool(keccak256("settings.minipool.new.enabled"));
    }

    /// @dev Existing mini pools are allowed to be closed and selfdestruct when finished
    function getMiniPoolClosingEnabled() public view returns (bool) { 
        return rocketStorage.getBool(keccak256("settings.minipool.closed.enabled"));
    }

    /// @dev Maximum amount of minipool contracts allowed
    function getMiniPoolMax() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.minipool.maxamount"));
    }

    /// @dev This is the minipool creation gas, makes a whole new contract, so has to be high (can be optimised also)
    function getMiniPoolNewGas() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.minipool.new.gas"));
    }

    /// @dev The gas required for depositing with Casper and being added as a validator
    function getMiniPoolDepositGas() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.minipool.deposit.gas"));
    }

     /// @dev Get staking time length for a given staking time ID, throw if its not a valid ID
    function getMiniPoolStakingTime(string _stakingTimeID) public view returns (uint256) {
        // Make sure the staking ID exists
        uint256 stakingTime = rocketStorage.getUint(keccak256("settings.minipool.staking.option", _stakingTimeID));
        require(stakingTime > 0);
        return stakingTime;
    }

    /// @dev Get the minimum required time for staking
    function getMiniPoolMinimumStakingTime() public view returns (uint256) {
        return getMiniPoolStakingTime("short");
    }

    /// @dev The default fee given as a % of 1 Ether (eg 5%)    
    function getMiniPoolWithdrawalFeePerc() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.minipool.fee.withdrawal.perc"));
    }

    /// @dev The account to send Rocket Pool Fees too, must be an account, not a contract address
    function getMiniPoolWithdrawalFeeDepositAddress() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.minipool.fee.withdrawal.address"));
    }

    /// @dev Are user backup addresses allowed to collect on behalf of the user after a certain time limit
    function getMiniPoolBackupCollectEnabled() public view returns (bool) {
        return rocketStorage.getBool(keccak256("settings.minipool.backupcollect.enabled"));
    }

    /// @dev The time limit of which after a deposit is received back from Casper, that the user backup address can get access to the deposit
    function getMiniPoolBackupCollectTime() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.minipool.backupcollect.time"));
    }

    /// @dev The default fee given as a % of 1 Ether (eg 5%)
    function getTokenRPDWithdrawalFeePerc() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.token.rpd.fee.withdrawal.perc"));
    }

    /// @dev Get the min eth needed for a node coinbase account to cover gas costs associated with checkins
    function getSmartNodeEtherMin() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.smartnode.account.ether.min"));
    }

    /// @dev Get the gas price for node checkins in Wei
    function getSmartNodeCheckinGas() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.smartnode.checkin.gas"));
    }

    /// @dev Can nodes be set inactive automatically by the contract? they won't receive new users
    function getSmartNodeSetInactiveAutomatic() public view returns (bool) {
        return rocketStorage.getBool(keccak256("settings.smartnode.setinactive.automatic"));
    }

    /// @dev The duration needed by a node not checking in to disable it, needs to be manually reanabled when fixed
    function getSmartNodeSetInactiveDuration() public view returns (uint256) {
        rocketStorage.getUint(keccak256("settings.smartnode.setinactive.duration")); 
    }
    

    /*** Setters **********************/

    /// @dev Set the current average block time in seconds in the ethereum
    function setAverageBlockTime(uint256 _timeInSeconds) public onlyOwner {
        require(_timeInSeconds > 0);
        rocketStorage.setUint(keccak256("settings.network.blocktime"), _timeInSeconds);  
    }

    /// @dev Set the minipools default status
    function setMiniPoolDefaultStatus(uint256 _statusID) public onlyOwner {
        rocketStorage.setUint(keccak256("settings.minipool.status.default"), _statusID);  
    }

    /// @dev Set the minimum Wei required for a pool to launch
    function setMiniPoolLaunchWei(uint256 _weiAmount) public onlyOwner {
        rocketStorage.setUint(keccak256("settings.minipool.launch.wei"), _weiAmount);  
    }

    /// @dev Set the time limit to stay in countdown before staking begins (eg 5 minutes)
    function setMiniPoolCountDownTime(uint256 _time) public onlyOwner {
        rocketStorage.setUint(keccak256("settings.minipool.countdown.time"), _time);  
    }

    /// @dev Set the possible staking times for minipools (the withdrawal time from Casper is added onto this, it is not included) 
    function setMiniPoolStakingTime(string _option, uint256 _time) public onlyOwner {
        require(_time > 0);
        rocketStorage.setUint(keccak256("settings.minipool.staking.option", _option), _time);  
    }

    /// @dev Set the Rocket Pool post Casper withdrawal fee given as a % of 1 Ether (eg 5% = 0.05 Ether = 50000000000000000 Wei)
    function setMiniPoolWithdrawalFeePerc(uint256 _withdrawalFeePerc) public onlyOwner {
        rocketStorage.setUint(keccak256("settings.minipool.fee.withdrawal.perc"), _withdrawalFeePerc); 
    }

    /// @dev The account to send Rocket Pool Fees too, must be an account, not a contract address
    function setMiniPoolWithdrawalFeeDepositAddress(address _depositAddress) public onlyOwner {
        rocketStorage.setAddress(keccak256("settings.minipool.fee.withdrawal.address"), _depositAddress); 
    }

    /// @dev Are user backup addresses allowed to collect on behalf of the user after a certain time limit
    function setMiniPoolBackupCollectEnabled(bool _enabled) public onlyOwner {
        rocketStorage.setBool(keccak256("settings.minipool.backupcollect.enabled"), _enabled); 
    }

    /// @dev The time limit of which after a deposit is received back from Casper, that the user backup address can get access to the deposit
    function setMiniPoolBackupCollectTime(uint256 _time) public onlyOwner {
        rocketStorage.setUint(keccak256("settings.minipool.backupcollect.time"), _time); 
    }

    /// @dev Minipools allowed to be created?
    function setMiniPoolNewEnabled(bool _enabled) public onlyOwner {
        rocketStorage.setBool(keccak256("settings.minipool.new.enabled"), _enabled); 
    }

    /// @dev Minipools allowed to be closed?
    function setMiniPoolClosingEnabled(bool _enabled) public onlyOwner {
        rocketStorage.setBool(keccak256("settings.minipool.closed.enabled"), _enabled); 
    }

    /// @dev Maximum amount of minipool contracts allowed
    function setMiniPoolMax(uint256 _amount) public onlyOwner {
        rocketStorage.setUint(keccak256("settings.minipool.maxamount"), _amount); 
    }

    /// @dev This is the minipool creation gas, makes a whole new contract, so has to be high (can be optimised also)
    function setMiniPoolNewGas(uint256 _gas) public onlyOwner {
        rocketStorage.setUint(keccak256("settings.minipool.new.gas"), _gas); 
    }

    /// @dev The gas required for depositing with Casper and being added as a validator
    function setMiniPoolDepositGas(uint256 _gas) public onlyOwner {
        rocketStorage.setUint(keccak256("settings.minipool.deposit.gas"), _gas); 
    }
    
    /// @dev The default fee given as a % of 1 Ether (eg 5%)
    function setTokenRPDWithdrawalFeePerc(uint256 _withdrawalFeePerc) public onlyOwner {
        rocketStorage.setUint(keccak256("settings.token.rpd.fee.withdrawal.perc"), _withdrawalFeePerc); 
    }

    /// @dev Set the min eth needed for a node coinbase account to cover gas costs associated with checkins
    function setSmartNodeEtherMin(uint256 _amount) public onlyOwner {
        rocketStorage.setUint(keccak256("settings.smartnode.account.ether.min"), _amount); 
    }

    /// @dev Set the gas price for node checkins in Wei
    function setSmartNodeCheckinGas(uint256 _amount) public onlyOwner {
        rocketStorage.setUint(keccak256("settings.smartnode.checkin.gas"), _amount); 
    }

    /// @dev Can nodes be set inactive automatically by the contract? they won't receive new users
    function setSmartNodeSetInactiveAutomatic(bool _enable) public onlyOwner {
        rocketStorage.setBool(keccak256("settings.smartnode.setinactive.automatic"), _enable); 
    }

    /// @dev The duration needed by a node not checking in to disable it, needs to be manually reanabled when fixed
    function setSmartNodeSetInactiveDuration(uint256 _amount) public onlyOwner {
        rocketStorage.setUint(keccak256("settings.smartnode.setinactive.duration"), _amount); 
    }


}
