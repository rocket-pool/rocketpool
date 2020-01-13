pragma solidity 0.5.8;


import "../../RocketBase.sol";
import "../../interface/RocketPoolInterface.sol";
import "../../interface/utils/lists/StringSetStorageInterface.sol";


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


    /*** Staking Durations ************/


    /// @dev Get the total number of staking durations
    function getMinipoolStakingDurationCount() public view returns (uint256) {
        StringSetStorageInterface stringSetStorage = StringSetStorageInterface(getContractAddress("utilStringSetStorage"));
        return stringSetStorage.getCount(keccak256(abi.encodePacked("settings.minipool.staking.duration.ids")));
    }


    /// @dev Get a staking duration ID by index
    /// @param _index The index of the staking duration to get
    function getMinipoolStakingDurationAt(uint256 _index) public view returns (string memory) {
        StringSetStorageInterface stringSetStorage = StringSetStorageInterface(getContractAddress("utilStringSetStorage"));
        return stringSetStorage.getItem(keccak256(abi.encodePacked("settings.minipool.staking.duration.ids")), _index);
    }


    /// @dev Get whether a staking duration exists
    /// @param _duration The duration ID
    function getMinipoolStakingDurationExists(string memory _duration) public view returns (bool) {
        StringSetStorageInterface stringSetStorage = StringSetStorageInterface(getContractAddress("utilStringSetStorage"));
        return (stringSetStorage.getIndexOf(keccak256(abi.encodePacked("settings.minipool.staking.duration.ids")), _duration) != -1);
    }


    /// @dev Get a staking duration's epochs
    /// @param _duration The duration ID
    function getMinipoolStakingDurationEpochs(string memory _duration) public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("settings.minipool.staking.duration.epochs", _duration)));
    }


    /// @dev Get whether a staking duration is enabled
    /// @param _duration The duration ID
    function getMinipoolStakingDurationEnabled(string memory _duration) public view returns (bool) {
        return rocketStorage.getBool(keccak256(abi.encodePacked("settings.minipool.staking.duration.enabled", _duration)));
    }


    /// @dev Add a staking duration
    /// @param _duration The duration ID
    /// @param _epochs The number of beacon chain epochs to stake for
    function addMinipoolStakingDuration(string memory _duration, uint256 _epochs) public onlySuperUser {
        // Get contracts
        StringSetStorageInterface stringSetStorage = StringSetStorageInterface(getContractAddress("utilStringSetStorage"));
        // Validate args
        require(stringSetStorage.getIndexOf(keccak256(abi.encodePacked("settings.minipool.staking.duration.ids")), _duration) == -1, "Staking duration already exists.");
        require(_epochs > 0, "Number of epochs for staking duration not specified.");
        // Add staking duration ID
        stringSetStorage.addItem(keccak256(abi.encodePacked("settings.minipool.staking.duration.ids")), _duration);
        // Set staking duration and enable
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.minipool.staking.duration.epochs", _duration)), _epochs);
        rocketStorage.setBool(keccak256(abi.encodePacked("settings.minipool.staking.duration.enabled", _duration)), true);
    }


    /// @dev Set a staking duration's epochs
    /// @param _duration The duration ID
    /// @param _epochs The number of beacon chain epochs to stake for
    function setMinipoolStakingDurationEpochs(string memory _duration, uint256 _epochs) public onlySuperUser {
        // Get contracts
        StringSetStorageInterface stringSetStorage = StringSetStorageInterface(getContractAddress("utilStringSetStorage"));
        // Validate args
        require(stringSetStorage.getIndexOf(keccak256(abi.encodePacked("settings.minipool.staking.duration.ids")), _duration) != -1, "Staking duration does not exist.");
        require(rocketStorage.getUint(keccak256(abi.encodePacked("settings.minipool.staking.duration.epochs", _duration))) != _epochs, "Staking duration epochs already set.");
        require(_epochs > 0, "Number of epochs for staking duration not specified.");
        // Set staking duration
        rocketStorage.setUint(keccak256(abi.encodePacked("settings.minipool.staking.duration.epochs", _duration)), _epochs);
    }


    /// @dev Set a staking duration's enabled status
    /// @param _duration The duration ID
    /// @param _enabled The staking duration's enabled status
    function setMinipoolStakingDurationEnabled(string memory _duration, bool _enabled) public onlySuperUser {
        // Get contracts
        StringSetStorageInterface stringSetStorage = StringSetStorageInterface(getContractAddress("utilStringSetStorage"));
        // Validate args
        require(stringSetStorage.getIndexOf(keccak256(abi.encodePacked("settings.minipool.staking.duration.ids")), _duration) != -1, "Staking duration does not exist.");
        require(rocketStorage.getBool(keccak256(abi.encodePacked("settings.minipool.staking.duration.enabled", _duration))) != _enabled, "Staking duration enabled status already set.");
        // Set staking duration enabled status
        rocketStorage.setBool(keccak256(abi.encodePacked("settings.minipool.staking.duration.enabled", _duration)), _enabled);
    }


}
