pragma solidity 0.4.23;


import "./RocketBase.sol";
import "./interface/RocketStorageInterface.sol";


/// @title Common settings that are used across all spoke contracts, mostly the main rocketpool and the mini pools it creates
/// @author David Rugendyke
contract RocketSettings is RocketBase {


    /*** Enums ***************/

    // Pool statuses are defined here and converted to uint when setting, their corresponding uint value is commented below
    enum PoolMiniStatuses { 
        PreLaunchAcceptingDeposits, // 0 - Accepting deposits for the pool, users can deposit multiple times and it will update their balance
        PreLaunchCountdown,         // 1 - The minimum required for this pool to start staking has been met and the countdown to start staking has started, users can withdraw their deposit if they change their mind during this time but cannot deposit more
        Staking,                    // 2 - The countdown has passed and the pool is now staking, users cannot deposit or withdraw until the minimum staking period has passed for their pool
        LoggedOut,                  // 3 - The pool has now requested logout from the casper validator contract, it will stay in this status until it can withdraw
        Withdrawn,                  // 4 - The pool has requested it's deposit from Casper and received its deposit +rewards || -penalties
        Closed                      // 5 - Pool has had all its balance withdrawn by its users and no longer contains any users or balance
    }


    /// @dev RocketSettings constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        /*** Version ***/
        version = 1;
    }


    /// @dev Initialise after deployment to not exceed the gas block limit
    function init() public onlyOwner {
        // Only set defaults on deployment
        if (!rocketStorage.getBool(keccak256("settings.init"))) {

             /*** Users ***/
            setUserDepositAllowed(true);                                                        // Are user deposits currently allowed?
            setUserDepositMin(1 ether);                                                         // Min required deposit in Wei 
            setUserDepositMax(75 ether);                                                        // Max allowed deposit in Wei 
            setUserWithdrawalAllowed(true);                                                     // Are withdrawals allowed?
            setUserWithdrawalMin(0);                                                            // Min allowed to be withdrawn in Wei, 0 = all
            setUserWithdrawalMax(10 ether);                                                     // Max allowed to be withdrawn in Wei     

            /*** Minipools ***/
            setMiniPoolDefaultStatus(uint256(PoolMiniStatuses.PreLaunchAcceptingDeposits));     // The default status for newly created mini pools
            setMiniPoolLaunchAmount(5 ether);                                                   // The minimum Wei required for a pool to launch
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

            /*** RPL and RPD Tokens ***/
            setTokenRPDWithdrawalFeePerc(0.0025 ether);                                         // The default fee given as a % of 1 Ether (eg 5%)

            /*** Smart Nodes ***/                                            
            setSmartNodeEtherMin(5 ether);                                                      // Set the min eth needed for a node coinbase account to cover gas costs associated with checkins
            setSmartNodeCheckinGas(20000000000);                                                // Set the gas price for node checkins in Wei (20 gwei)
            setSmartNodeSetInactiveAutomatic(true);                                             // Can nodes be set inactive automatically by the contract? they won't receive new users
            setSmartNodeSetInactiveDuration(1 hours);                                           // The duration needed by a node not checking in to disable it, needs to be manually reanabled when fixed

            /*** Vault ***/
            setVaultDepositAllowed(true);                                                       // Are deposits into the Rocket Vault allowed?
            setVaultWithdrawalAllowed(true);                                                    // Are withdrawals from the Rocket Vault allowed?

            rocketStorage.setBool(keccak256("settings.init"), true);
        }
    }


    /*** Getters *****************/

    /// @dev Get the current average block time for the network
    function getAverageBlockTime() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.network.blocktime"));
    }


    /*** Users ***/

    /// @dev Are user deposits currently allowed?                                                 
    function getUserDepositAllowed() public view returns (bool) {
        return rocketStorage.getBool(keccak256("settings.user.deposit.allowed")); 
    }

    /// @dev Min required deposit in Wei 
    function getUserDepositMin() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.user.deposit.min")); 
    }

    /// @dev Max allowed deposit in Wei 
    function getUserDepositMax() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.user.deposit.max")); 
    }

    /// @dev Are withdrawals allowed?                                            
    function getUserWithdrawalAllowed() public view returns (bool) {
        return rocketStorage.getBool(keccak256("settings.user.withdrawal.allowed")); 
    }

    /// @dev Min allowed to be withdrawn in Wei, 0 = all
    function getUserWithdrawalMin() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.user.withdrawal.min")); 
    }

    /// @dev Max allowed to be withdrawn in Wei
    function getUserWithdrawalMax() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.user.withdrawal.max")); 
    }


    /*** MiniPools ***/
    
    /// @dev Get default status of a new mini pool
    function getMiniPoolDefaultStatus() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.minipool.status.default"));
    }

    /// @dev The minimum Wei required for a pool to launch
    function getMiniPoolLaunchAmount() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.minipool.launch.wei"));
    }

    /// @dev The time limit to stay in countdown before staking begins
    function getMiniPoolCountDownTime() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.minipool.countdown.time"));
    }
    
    /// @dev Check to see if new pools are allowed to be created
    function getMiniPoolAllowedToBeCreated() public view returns (bool) { 
        // New pools allowed to be created?
        if (!getMiniPoolNewEnabled() || rocketStorage.getUint(keccak256("minipools.active.total")) >= getMiniPoolMax()) {
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
    function getMiniPoolWithdrawalFeeDepositAddress() public view returns (address) {
        return rocketStorage.getAddress(keccak256("settings.minipool.fee.withdrawal.address"));
    }

    /// @dev Are user backup addresses allowed to collect on behalf of the user after a certain time limit
    function getMiniPoolBackupCollectEnabled() public view returns (bool) {
        return rocketStorage.getBool(keccak256("settings.minipool.backupcollect.enabled"));
    }

    /// @dev The time limit of which after a deposit is received back from Casper, that the user backup address can get access to the deposit
    function getMiniPoolBackupCollectTime() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.minipool.backupcollect.time"));
    }


    /*** Tokens ***/

    /// @dev The default fee given as a % of 1 Ether (eg 5%)
    function getTokenRPDWithdrawalFeePerc() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.token.rpd.fee.withdrawal.perc"));
    }


    /*** Smart Nodes ***/

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
    

    /*** Vault ***/

    /// @dev Deposits allowed?
    function getVaultDepositAllowed() public view returns (bool) {
        return rocketStorage.getBool(keccak256("settings.vault.deposit.allowed"));
    }

    /// @dev Withdrawals allowed?
    function getVaultWithdrawalAllowed() public view returns (bool) {
        return rocketStorage.getBool(keccak256("settings.vault.withdrawal.allowed"));
    }




    /*** Setters **********************/

    /// @dev Set the current average block time in seconds in the ethereum
    function setAverageBlockTime(uint256 _timeInSeconds) public onlySuperUser {
        require(_timeInSeconds > 0);
        rocketStorage.setUint(keccak256("settings.network.blocktime"), _timeInSeconds);  
    }

    
    /*** Users ***/

    /// @dev Are user deposits currently allowed?                                                 
    function setUserDepositAllowed(bool _enabled) public onlySuperUser {
        rocketStorage.setBool(keccak256("settings.user.deposit.allowed"), _enabled); 
    }

    /// @dev Min required deposit in Wei 
    function setUserDepositMin(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256("settings.user.deposit.min"), _weiAmount); 
    }

    /// @dev Max allowed deposit in Wei 
    function setUserDepositMax(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256("settings.user.deposit.max"), _weiAmount); 
    }

    /// @dev Are withdrawals allowed?                                            
    function setUserWithdrawalAllowed(bool _enabled) public onlySuperUser {
        rocketStorage.setBool(keccak256("settings.user.withdrawal.allowed"), _enabled); 
    }

    /// @dev Min allowed to be withdrawn in Wei, 0 = all
    function setUserWithdrawalMin(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256("settings.user.withdrawal.min"), _weiAmount); 
    }

    /// @dev Max allowed to be withdrawn in Wei
    function setUserWithdrawalMax(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256("settings.user.withdrawal.max"), _weiAmount); 
    }


    /*** Minipools ***/

    /// @dev Set the minipools default status
    function setMiniPoolDefaultStatus(uint256 _statusID) public onlySuperUser {
        rocketStorage.setUint(keccak256("settings.minipool.status.default"), _statusID);  
    }

    /// @dev Set the minimum Wei required for a pool to launch
    function setMiniPoolLaunchAmount(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256("settings.minipool.launch.wei"), _weiAmount);  
    }

    /// @dev Set the time limit to stay in countdown before staking begins (eg 5 minutes)
    function setMiniPoolCountDownTime(uint256 _time) public onlySuperUser {
        rocketStorage.setUint(keccak256("settings.minipool.countdown.time"), _time);  
    }

    /// @dev Set the possible staking times for minipools (the withdrawal time from Casper is added onto this, it is not included) 
    function setMiniPoolStakingTime(string _option, uint256 _time) public onlySuperUser {
        require(_time > 0);
        rocketStorage.setUint(keccak256("settings.minipool.staking.option", _option), _time);  
    }

    /// @dev Set the Rocket Pool post Casper withdrawal fee given as a % of 1 Ether (eg 5% = 0.05 Ether = 50000000000000000 Wei)
    function setMiniPoolWithdrawalFeePerc(uint256 _withdrawalFeePerc) public onlySuperUser {
        rocketStorage.setUint(keccak256("settings.minipool.fee.withdrawal.perc"), _withdrawalFeePerc); 
    }

    /// @dev The account to send Rocket Pool Fees too, must be an account, not a contract address
    function setMiniPoolWithdrawalFeeDepositAddress(address _depositAddress) public onlySuperUser {
        rocketStorage.setAddress(keccak256("settings.minipool.fee.withdrawal.address"), _depositAddress); 
    }

    /// @dev Are user backup addresses allowed to collect on behalf of the user after a certain time limit
    function setMiniPoolBackupCollectEnabled(bool _enabled) public onlySuperUser {
        rocketStorage.setBool(keccak256("settings.minipool.backupcollect.enabled"), _enabled); 
    }

    /// @dev The time limit of which after a deposit is received back from Casper, that the user backup address can get access to the deposit
    function setMiniPoolBackupCollectTime(uint256 _time) public onlySuperUser {
        rocketStorage.setUint(keccak256("settings.minipool.backupcollect.time"), _time); 
    }

    /// @dev Minipools allowed to be created?
    function setMiniPoolNewEnabled(bool _enabled) public onlySuperUser {
        rocketStorage.setBool(keccak256("settings.minipool.new.enabled"), _enabled); 
    }

    /// @dev Minipools allowed to be closed?
    function setMiniPoolClosingEnabled(bool _enabled) public onlySuperUser {
        rocketStorage.setBool(keccak256("settings.minipool.closed.enabled"), _enabled); 
    }

    /// @dev Maximum amount of minipool contracts allowed
    function setMiniPoolMax(uint256 _amount) public onlySuperUser {
        rocketStorage.setUint(keccak256("settings.minipool.maxamount"), _amount); 
    }

    /// @dev This is the minipool creation gas, makes a whole new contract, so has to be high (can be optimised also)
    function setMiniPoolNewGas(uint256 _gas) public onlySuperUser {
        rocketStorage.setUint(keccak256("settings.minipool.new.gas"), _gas); 
    }

    /// @dev The gas required for depositing with Casper and being added as a validator
    function setMiniPoolDepositGas(uint256 _gas) public onlySuperUser {
        rocketStorage.setUint(keccak256("settings.minipool.deposit.gas"), _gas); 
    }


    /*** Tokens ***/
    
    /// @dev The default fee given as a % of 1 Ether (eg 5%)
    function setTokenRPDWithdrawalFeePerc(uint256 _withdrawalFeePerc) public onlySuperUser {
        rocketStorage.setUint(keccak256("settings.token.rpd.fee.withdrawal.perc"), _withdrawalFeePerc); 
    }


    /*** Smart Nodes ***/

    /// @dev Set the min eth needed for a node coinbase account to cover gas costs associated with checkins
    function setSmartNodeEtherMin(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256("settings.smartnode.account.ether.min"), _weiAmount); 
    }

    /// @dev Set the gas price for node checkins in Wei
    function setSmartNodeCheckinGas(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256("settings.smartnode.checkin.gas"), _weiAmount); 
    }

    /// @dev Can nodes be set inactive automatically by the contract? they won't receive new users
    function setSmartNodeSetInactiveAutomatic(bool _enable) public onlySuperUser {
        rocketStorage.setBool(keccak256("settings.smartnode.setinactive.automatic"), _enable); 
    }

    /// @dev The duration needed by a node not checking in to disable it, needs to be manually reanabled when fixed
    function setSmartNodeSetInactiveDuration(uint256 _amount) public onlySuperUser {
        rocketStorage.setUint(keccak256("settings.smartnode.setinactive.duration"), _amount); 
    }



    /*** Vault ***/

    /// @dev Deposits allowed?
    function setVaultDepositAllowed(bool _enable) public onlySuperUser {
        rocketStorage.setBool(keccak256("settings.vault.deposit.allowed"), _enable);
    }

    /// @dev Withdrawals allowed?
    function setVaultWithdrawalAllowed(bool _enable) public onlySuperUser {
        rocketStorage.setBool(keccak256("settings.vault.withdrawal.allowed"), _enable);
    }


}
