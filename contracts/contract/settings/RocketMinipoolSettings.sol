pragma solidity 0.4.24;


import "../../RocketBase.sol";
import "../../interface/RocketPoolInterface.sol";


/// @title Settings for Minipools in Rocket Pool
/// @author David Rugendyke
contract RocketMinipoolSettings is RocketBase {


    /*** Enums ***************/

    // Pool statuses are defined here and converted to uint when setting, their corresponding uint value is commented below
    enum MinipoolStatuses { 
        Initialised,                // 0 - A new minipool instance created by a node with their ether/rpl on it, has not been assigned any users yet and can be removed by the node owner if desired.
        PreLaunch,                  // 1 - Minipool has been assigned user(s) ether but not enough to begin staking yet. Users can withdraw their ether at this point if they change their mind. Node owners cannot withdraw their ether/rpl.
        Staking,                    // 2 - Minipool has received enough ether to begin staking, it's users and node owners ether is combined and sent to stake with Casper for the desired duration.
        LoggedOut,                  // 3 - The pool has now requested logout from the casper validator contract, it will stay in this status until it can withdraw
        Withdrawn,                  // 4 - The pool has requested it's deposit from Casper and received its deposit +rewards || -penalties
        Closed                      // 5 - Pool has had all its balance withdrawn by its users and no longer contains any users or balance
    }



    /// @dev RocketSettings constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        /*** Version ***/
        version = 1;
        // Only set defaults on deployment
        if (!rocketStorage.getBool(keccak256(abi.encodePacked("settings.minipool.init")))) {
            /*** Minipools ***/
            setMinipoolDefaultStatus(uint256(MinipoolStatuses.Initialised));                    // The default status for newly created mini pools
            setMinipoolLaunchAmount(32 ether);                                                  // The exact Wei required for a pool to launch
            setMinipoolCountDown(240);                                                          // The block count to stay in countdown before staking begins - Default is 240 (1hr)
            setMinipoolStakingDuration("3m", 526000);                                           // Set the possible staking times for minipools in blocks given avg 15sec blocktime, 3 months (the withdrawal time from Casper is added onto this, it is not included) 
            setMinipoolStakingDuration("6m",  1052000);                                         // 6 Months
            setMinipoolStakingDuration("12m", 2104000);                                         // 12 Months
            setMinipoolWithdrawalFeePerc(0.05 ether);                                           // The default fee given as a % of 1 Ether (eg 5%)    
            setMinipoolWithdrawalFeeDepositAddress(msg.sender);                                 // The account to send Rocket Pool Fees too, must be an account, not a contract address
            setMinipoolBackupCollectEnabled(true);                                              // Are user backup addresses allowed to collect on behalf of the user after a certain time limit
            setMinipoolBackupCollectDuration(526000);                                           // The block count limit of which after a deposit is received back from Casper, that the user backup address can get access to the deposit - 3months default
            setMinipoolNewEnabled(true);                                                        // Minipools allowed to be created?
            setMinipoolNewMaxAtOnce(2);                                                         // How many minipools are allowed to be created at once? keep gas block limit in mind
            setMinipoolClosingEnabled(true);                                                    // Minipools allowed to be closed?
            setMinipoolMax(20);                                                                 // Maximum amount of minipool contracts allowed
            setMinipoolNewGasLimit(4800000);                                                    // This is the minipool creation gas limit, makes a whole new contract, so has to be high (can be optimised also)
            setMinipoolNewGasPrice(0.000000002 ether);                                          // This is the minipool creation gas price - default 2 gwei
            setMinipoolDepositGas(400000);                                                      // The gas required for depositing with Casper and being added as a validator
            // Set init as complete
            rocketStorage.setBool(keccak256(abi.encodePacked("settings.minipool.init")), true);
        }
    }

    
    /*** Getters **********************/


    /// @dev Get default status of a new mini pool
    function getMinipoolDefaultStatus() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.minipool.status.default"));
    }

    /// @dev The minimum Wei required for a pool to launch
    function getMinipoolLaunchAmount() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.minipool.launch.wei"));
    }

    /// @dev The time limit to stay in countdown before staking begins
    function getMinipoolCountDownTime() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.minipool.countdown.blocks"));
    }
    
    /// @dev Check to see if new pools are allowed to be created
    function getMinipoolCanBeCreated() public view returns (bool) { 
        // Get the main Rocket Pool contract
        RocketPoolInterface rocketPool = RocketPoolInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketPool"))));
        // New pools allowed to be created?
        // TODO: Renable when methods added to new RP contract
        //if (!getMinipoolNewEnabled() || rocketPool.getActivePoolsCount() >= getMinipoolMax()) {
       //     return false;
        //}
        return true;
    }

    /// @dev Minipools allowed to be created?
    function getMinipoolNewEnabled() public view returns (bool) {
        return rocketStorage.getBool(keccak256("settings.minipool.new.enabled"));
    }

    /// @dev How many minipools are allowed to be created at once? keep gas block limit in mind
    function getMinipoolNewMaxAtOnce() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.minipool.new.max"));
    }

    /// @dev Existing mini pools are allowed to be closed and selfdestruct when finished
    function getMinipoolClosingEnabled() public view returns (bool) { 
        return rocketStorage.getBool(keccak256("settings.minipool.closed.enabled"));
    }

    /// @dev Maximum amount of minipool contracts allowed
    function getMinipoolMax() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.minipool.maxamount"));
    }

    /// @dev This is the minipool creation gas, makes a whole new contract, so has to be high (can be optimised also)
    function getMinipoolNewGas() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.minipool.new.gas"));
    }

    /// @dev The gas required for depositing with Casper and being added as a validator
    function getMinipoolDepositGas() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.minipool.deposit.gas"));
    }

     /// @dev Get staking duration blocks for a given staking time ID, throw if its not a valid ID
    function getMinipoolStakingDuration(string _durationID) public view returns (uint256) {
        // Make sure the staking ID exists
        uint256 stakingTime = rocketStorage.getUint(keccak256(abi.encodePacked("settings.minipool.staking.option", _durationID)));
        require(stakingTime > 0, "Minipool staking duration ID specified does not match any current staking durations.");
        return stakingTime;
    }

    /// @dev Get the minimum required time for staking
    function getMinipoolMinimumStakingTime() public view returns (uint256) {
        return getMinipoolStakingDuration("3m");
    }

    /// @dev The default fee given as a % of 1 Ether (eg 5%)    
    function getMinipoolWithdrawalFeePerc() public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.minipool.fee.withdrawal.perc")));
    }

    /// @dev The account to send Rocket Pool Fees too, must be an account, not a contract address
    function getMinipoolWithdrawalFeeDepositAddress() public view returns (address) {
        return rocketStorage.getAddress(keccak256(abi.encodePacked("settings.minipool.fee.withdrawal.address")));
    }

    /// @dev Are user backup addresses allowed to collect on behalf of the user after a certain time limit
    function getMinipoolBackupCollectEnabled() public view returns (bool) {
        return rocketStorage.getBool(keccak256(abi.encodePacked("settings.minipool.backupcollect.enabled")));
    }

    /// @dev The block count of which after a deposit is received back from Casper, that the user backup address can get access to the deposit
    function getMinipoolBackupCollectDuration() public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.minipool.backupcollect.blocks")));
    }




    /*** Setters **********************/


    /// @dev Set the minipools default status
    function setMinipoolDefaultStatus(uint256 _statusID) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.minipool.status.default")), _statusID);  
    }

    /// @dev Set the minimum Wei required for a pool to launch
    function setMinipoolLaunchAmount(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.minipool.launch.wei")), _weiAmount);  
    }

    /// @dev Set the block count to stay in countdown before staking begins
    function setMinipoolCountDown(uint256 _blocks) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.minipool.countdown.time")), _blocks);  
    }

    /// @dev Set the possible staking durations for minipools (the withdrawal time from Casper is added onto this, it is not included) 
    function setMinipoolStakingDuration(string _option, uint256 _blocks) public onlySuperUser {
        require(_blocks > 0, "Amount of blocks for staking duration not specified.");
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.minipool.staking.option", _option)), _blocks);  
    }

    /// @dev Set the Rocket Pool post Casper withdrawal fee given as a % of 1 Ether (eg 5% = 0.05 Ether = 50000000000000000 Wei)
    function setMinipoolWithdrawalFeePerc(uint256 _withdrawalFeePerc) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.minipool.fee.withdrawal.perc")), _withdrawalFeePerc); 
    }

    /// @dev The account to send Rocket Pool Fees too, must be an account, not a contract address
    function setMinipoolWithdrawalFeeDepositAddress(address _depositAddress) public onlySuperUser {
        rocketStorage.setAddress(keccak256(abi.encodePacked("settings.minipool.fee.withdrawal.address")), _depositAddress); 
    }

    /// @dev Are user backup addresses allowed to collect on behalf of the user after a certain time limit
    function setMinipoolBackupCollectEnabled(bool _enabled) public onlySuperUser {
        rocketStorage.setBool(keccak256(abi.encodePacked("settings.minipool.backupcollect.enabled")), _enabled); 
    }

    /// @dev The time limit of which after a deposit is received back from Casper, that the user backup address can get access to the deposit
    function setMinipoolBackupCollectDuration(uint256 _blocks) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.minipool.backupcollect.time")), _blocks); 
    }

    /// @dev Minipools allowed to be created?
    function setMinipoolNewEnabled(bool _enabled) public onlySuperUser {
        rocketStorage.setBool(keccak256(abi.encodePacked("settings.minipool.new.enabled")), _enabled); 
    }

    /// @dev How many minipools are allowed to be created at once? keep gas block limit in mind
    function setMinipoolNewMaxAtOnce(uint256 _amount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.minipool.new.max")), _amount); 
    }

    /// @dev Minipools allowed to be closed?
    function setMinipoolClosingEnabled(bool _enabled) public onlySuperUser {
        rocketStorage.setBool(keccak256(abi.encodePacked("settings.minipool.closed.enabled")), _enabled); 
    }

    /// @dev Maximum amount of minipool contracts allowed
    function setMinipoolMax(uint256 _amount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.minipool.maxamount")), _amount); 
    }

    /// @dev This is the minipool creation gas, makes a whole new contract, so has to be high (can be optimised also)
    function setMinipoolNewGasLimit(uint256 _gas) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.minipool.new.gas")), _gas); 
    }

    /// @dev This is the minipool creation gas price - default 2 gwei
    function setMinipoolNewGasPrice(uint256 _price) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.minipool.new.price")), _price); 
    }

    /// @dev The gas required for depositing with Casper and being added as a validator
    function setMinipoolDepositGas(uint256 _gas) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.minipool.deposit.gas")), _gas); 
    }



}
