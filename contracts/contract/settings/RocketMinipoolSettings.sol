pragma solidity 0.5.8;


import "../../RocketBase.sol";
import "../../interface/RocketPoolInterface.sol";


/// @title Settings for Minipools in Rocket Pool
/// @author David Rugendyke
contract RocketMinipoolSettings is RocketBase {


    /*** Enums ***************/

    // Pool statuses are defined here and converted to uint when setting, their corresponding uint value is commented below
    enum MinipoolStatuses { 
        Initialised,                // 0 - A new minipool instance created by a node with their ether/rpl on it, has not been assigned any users yet and can be removed by the node owner if desired.
        PreLaunch,                  // 1 - Minipool has been assigned user(s) ether but not enough to begin staking yet. Node owners cannot withdraw their ether/rpl.
        Staking,                    // 2 - Minipool has received enough ether to begin staking, it's users and node owners ether is combined and sent to stake with Casper for the desired duration.
        LoggedOut,                  // 3 - The pool has now requested logout from the casper validator contract, it will stay in this status until it can withdraw
        Withdrawn,                  // 4 - The pool has requested it's deposit from Casper and received its deposit +rewards || -penalties
        Closed,                     // 5 - Pool has had all its balance withdrawn by its users and no longer contains any users or balance
        TimedOut                    // 6 - The minipool has been assigned user(s) but has still not begun staking within the timeout period. The minipool will not progress to staking, and all users can withdraw.
    }



    /// @dev RocketSettings constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        /*** Version ***/
        version = 1;
        // Only set defaults on deployment
        if (!rocketStorage.getBool(keccak256(abi.encodePacked("settings.minipool.init")))) {
            /*** Minipools ***/
            setMinipoolLaunchAmount(32 ether);                                                  // The exact Wei required for a pool to launch
            setMinipoolStakingDuration("3m", 526000);                                           // Set the possible staking times for minipools in blocks given avg 15sec blocktime, 3 months (the withdrawal time from Casper is added onto this, it is not included) 
            setMinipoolStakingDuration("6m",  1052000);                                         // 6 Months
            setMinipoolStakingDuration("12m", 2104000);                                         // 12 Months
            setMinipoolCheckInterval(1 hours);                                                  // The interval that a watchtower should check active minipools in seconds
            setMinipoolWithdrawalFeeDepositAddress(msg.sender);                                 // The account to send Rocket Pool Fees too, must be an account, not a contract address
            setMinipoolBackupCollectEnabled(true);                                              // Are user backup addresses allowed to collect on behalf of the user after a certain time limit
            setMinipoolBackupCollectDuration(526000);                                           // The block count limit of which after a deposit is received back from Casper, that the user backup address can get access to the deposit - 3months default
            setMinipoolNewEnabled(true);                                                        // Minipools allowed to be created?
            setMinipoolClosingEnabled(true);                                                    // Minipools allowed to be closed?
            setMinipoolMax(0);                                                                  // Maximum amount of minipool contracts allowed - 0 = unlimited
            setMinipoolTimeout(4 weeks);                                                        // If a minipool has users, but has not begun staking for this time period, it is classed as timed out and can be closed with users refunded
            setMinipoolActiveSetSize(4);                                                        // The number of minipools in the active set
            // Set init as complete
            rocketStorage.setBool(keccak256(abi.encodePacked("settings.minipool.init")), true);
        }
    }

    
    /*** Getters **********************/


    /// @dev The minimum Wei required for a pool to launch
    function getMinipoolLaunchAmount() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.minipool.launch.wei"));
    }
    
    /// @dev Check to see if new pools are allowed to be created
    function getMinipoolCanBeCreated() public returns (bool) { 
        // Get the main Rocket Pool contract
        RocketPoolInterface rocketPool = RocketPoolInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketPool"))));
        // New pools allowed to be created?
        if (!getMinipoolNewEnabled() || (getMinipoolMax() > 0 && rocketPool.getPoolsCount() >= getMinipoolMax())) {
            return false;
        }
        return true;
    }

    /// @dev Minipools allowed to be created?
    function getMinipoolNewEnabled() public view returns (bool) {
        return rocketStorage.getBool(keccak256("settings.minipool.new.enabled"));
    }

    /// @dev Existing mini pools are allowed to be closed and selfdestruct when finished
    function getMinipoolClosingEnabled() public view returns (bool) { 
        return rocketStorage.getBool(keccak256("settings.minipool.closed.enabled"));
    }

    /// @dev Maximum amount of minipool contracts allowed
    function getMinipoolMax() public view returns (uint256) {
        return rocketStorage.getUint(keccak256("settings.minipool.maxamount"));
    }

    /// @dev Get staking duration blocks for a given staking time ID, throw if its not a valid ID
    function getMinipoolStakingDuration(string memory _durationID) public view returns (uint256) {
        // Make sure the staking ID exists
        uint256 stakingTime = rocketStorage.getUint(keccak256(abi.encodePacked("settings.minipool.staking.option", _durationID)));
        require(stakingTime > 0, "Minipool staking duration ID specified does not match any current staking durations.");
        return stakingTime;
    }

    /// @dev The interval that a watchtower should check active minipools in seconds
    function getMinipoolCheckInterval() public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.minipool.check.interval")));
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

    /// @dev If a minipool has users, but has not begun staking for this time period, it is classed as timed out and can be closed with users refunded
    function getMinipoolTimeout() public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.minipool.timeout.period")));
    }

    /// @dev The number of minipools in the active set
    function getMinipoolActiveSetSize() public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.minipool.activeset.size")));
    }




    /*** Setters **********************/


    /// @dev Set the minimum Wei required for a pool to launch
    function setMinipoolLaunchAmount(uint256 _weiAmount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.minipool.launch.wei")), _weiAmount);  
    }

    /// @dev Set the possible staking durations for minipools (the withdrawal time from Casper is added onto this, it is not included) 
    function setMinipoolStakingDuration(string memory _duration, uint256 _blocks) public onlySuperUser {
        require(_blocks > 0, "Amount of blocks for staking duration not specified.");
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.minipool.staking.option", _duration)), _blocks);  
    }

    /// @dev The interval that a watchtower should check active minipools in seconds
    function setMinipoolCheckInterval(uint256 _interval) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.minipool.check.interval")), _interval);
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
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.minipool.backupcollect.blocks")), _blocks); 
    }

    /// @dev Minipools allowed to be created?
    function setMinipoolNewEnabled(bool _enabled) public onlySuperUser {
        rocketStorage.setBool(keccak256(abi.encodePacked("settings.minipool.new.enabled")), _enabled); 
    }

    /// @dev Minipools allowed to be closed?
    function setMinipoolClosingEnabled(bool _enabled) public onlySuperUser {
        rocketStorage.setBool(keccak256(abi.encodePacked("settings.minipool.closed.enabled")), _enabled); 
    }

    /// @dev Maximum amount of minipool contracts allowed
    function setMinipoolMax(uint256 _amount) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.minipool.maxamount")), _amount); 
    }

    /// @dev If a minipool has users, but has not begun staking for this time period, it is classed as timed out and can be closed with users refunded
    function setMinipoolTimeout(uint256 _time) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.minipool.timeout.period")), _time); 
    }

    /// @dev The number of minipools in the active set
    function setMinipoolActiveSetSize(uint256 _size) public onlySuperUser {
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.minipool.activeset.size")), _size);
    }


}
