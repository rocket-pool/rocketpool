pragma solidity 0.4.18;

import "zeppelin-solidity/contracts/ownership/Ownable.sol";

import "./RocketPoolMini.sol"; 
import "./interface/RocketUserInterface.sol";
import "./interface/RocketFactoryInterface.sol";
import "./interface/RocketNodeInterface.sol";
import "./interface/RocketStorageInterface.sol";
import "./interface/RocketSettingsInterface.sol";


/// @title First alpha of an Ethereum POS pool - Rocket Pool! - This is the primary upgradable contract
/// @author David Rugendyke

contract RocketPool is Ownable {
    /*** Contracts **************/

    RocketUserInterface rocketUser = RocketUserInterface(0);              // The main user interface methods
    RocketStorageInterface rocketStorage = RocketStorageInterface(0);     // The main storage contract where primary persistant storage is maintained  
    RocketSettingsInterface rocketSettings = RocketSettingsInterface(0);  // The main settings contract most global parameters are maintained

    /// @dev rocketPool constructor
    function RocketPool(address _rocketStorageAddress) public { 
        // Update the contract address 
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
    }
    
    /*** Events ****************/

    event PoolAssignedUser (
        address indexed _userAddress,
        address indexed _partnerAddress,
        address indexed _pool,
        uint256 created 
    );

    event PoolCreated (
        address indexed _address,
        uint256 indexed _stakingDurationInSeconds,
        uint256 created
    );

    event PoolRemoved (
        address indexed _address,
        uint256 created
    );

    event PoolsGetWithStatus (
        uint256 indexed _status,
        uint256 poolsFound,
        uint256 created
    );

    event PoolAssignedToNode (
        address indexed _miniPoolAddress,
        address indexed _nodeAddress,
        uint256 created
    );

    event FlagAddress (
        address flag
    );

    event FlagUint (
        uint256 flag
    );
    
    /*** Modifiers *************/
    
    /// @dev New pools are allowed to be created
    modifier poolsAllowedToBeCreated() {
        // Get the mini pool count
        rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        // New pools allowed to be created?
        assert(rocketSettings.getPoolAllowedToBeCreated() == true);
        _;
    }

    /// @dev Only allow access from the latest version of the RocketPool contract
    modifier onlyLatestRocketPool() {
        assert(this == rocketStorage.getAddress(keccak256("contract.name", "rocketPool")));
        _;
    }

    /// @dev Only allow access from the latest version of the main RocketNode contract
    modifier onlyLatestRocketNode() {
        assert(msg.sender == rocketStorage.getAddress(keccak256("contract.name", "rocketNode")));
        _;
    } 

    /// @dev Only allow access from the latest version of the main RocketUser contract
    modifier onlyLatestRocketUser() {
        assert(msg.sender == rocketStorage.getAddress(keccak256("contract.name", "rocketUser")));
        _;
    } 

    /// @dev Only registered pool node addresses can access
    /// @param _minipoolAddress pool account address.
    modifier onlyMiniPool(address _minipoolAddress) {
        require(rocketStorage.getBool(keccak256("minipool.exists", _minipoolAddress)));
        _;
    }

    /*** External functions *************/

    /// @dev Get an available minipool for a user to be assigned too
    /// @param _newUserAddress New user account
    /// @param _partnerAddress The address of the Rocket Pool partner
    /// @param _poolStakingDuration The duration that the user wishes to stake for
    function addUserToAvailablePool(address _newUserAddress, address _partnerAddress, uint256 _poolStakingDuration) external onlyLatestRocketUser() returns(address) {
        // The desired pool address to asign the user too
        address poolAssignToAddress = 0;
        // The contract of the desired pool address
        RocketPoolMini poolAddUserTo = RocketPoolMini(0);
        // Check to see if this user is already in the next pool to launch that has the same staking duration period (ie 3 months, 6 months etc)
        address[] memory poolsFound = getPoolsFilterWithStatusAndDuration(0, _poolStakingDuration);
        // No pools awaiting? lets make one
        if (poolsFound.length == 0) {
            // Create new pool contract
            poolAssignToAddress = createPool(_poolStakingDuration);
        } else {
            // Check to see if there's a pool this user doesn't already have a deposit in, 1 user address per pool
            for (uint32 i = 0; i < poolsFound.length; i++) {
                // Have we found one already?
                if (poolAssignToAddress == 0) {
                    // Get the contract instance 
                    poolAddUserTo = getPoolInstance(poolsFound[i]);
                    // Does this exist in this pool? If so, select this pool so their deposit gets incremented
                    if (poolAddUserTo.getUserExists(_newUserAddress)) {
                        // Add them to a minipool acceptind deposits that they already belong too
                        poolAssignToAddress = poolsFound[i];
                    }
                }
            }
            // They don't already have any deposits in a minipool, add them to the first pool we found that matches their desired staking time
            if (poolAssignToAddress == 0) {
                poolAssignToAddress = poolsFound[0];
            }
        }    

        // Do we have a valid pool and they are added ok? If not, now available pools and new pool creation has failed, send funds back;
        assert(poolAssignToAddress != 0);
        
        // Get the contract instance
        poolAddUserTo = getPoolInstance(poolAssignToAddress);
        // Double check the pools status is accepting deposits and user isn't in there already
        if (poolAddUserTo.getStatus() == 0) {
            // User is added if they don't exist in it already
            if (poolAddUserTo.addUser(_newUserAddress, _partnerAddress)) {
                // Fire the event
                PoolAssignedUser(_newUserAddress, _partnerAddress, poolAssignToAddress, now);
            } 
            // Return the pool address that the user belongs to
            return poolAssignToAddress;
        }    
    }

        /// @dev See if there are any pools thats launch countdown has expired that need to be launched for staking
    /// @dev This method is designed to only process one minipool status type from each node checkin every 15 mins to prevent the gas block limit from being exceeded and make load balancing more accurate
    function poolNodeActions() external onlyLatestRocketNode {
        // Get our Rocket Node contract
        RocketNodeInterface rocketNode = RocketNodeInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketNode")));
        // Create an empty instance of a pool contract to populate later if we find one
        RocketPoolMini pool = RocketPoolMini(0);
        // Our shared iterator 
        uint32 i = 0;
        // Find the pools requested with the status
        address[] memory poolsFound = getPoolsFilterWithStatus(1);
        // Do we have any pools awaiting launch?
        if (poolsFound.length > 0) {
            // Ready to launch?
            for (i = 0; i < poolsFound.length; i++) {
                // Get an instance of that pool contract
                pool = RocketPoolMini(poolsFound[i]);
                // Check its ok
                require(pool.owner() != 0x0);
                // In order to begin staking, a node must be assigned to the pool and the timer for the launch must be past
                if (pool.getNodeAddress() == 0 && pool.getStakingDepositTimeMet() == true) {
                    // Get a node for this pool to be assigned too
                    address nodeAddress = rocketNode.getNodeAvailableForPool();
                    // That node must exist
                    require(nodeAddress != 0x0);
                    // Assign the pool to our node with the least average work load to help load balance the nodes and the the casper registration details
                    pool.setNodeDetails(nodeAddress);
                    // Fire the event
                    PoolAssignedToNode(nodeAddress, poolsFound[i], now);
                    // Now set the pool to begin staking with casper by updating its status with the newly assigned node
                    pool.updateStatus();
                    // Exit the loop
                    break;
                }
            }
        }
        // See if there are any pools thats can start the withdrawal process with Casper
        poolsFound = getPoolsFilterWithStatus(2);
        // Do we have any pools currently staking?
        if (poolsFound.length > 0) {
            // Ready for re-entry?
            for (i = 0; i < poolsFound.length; i++) {
                // Get an instance of that pool contract
                pool = getPoolInstance(poolsFound[i]);
                // Is this currently staking pool due to request withdrawal from Casper?
                if (pool.getStakingRequestWithdrawalTimeMet() == true) {
                    // Now set the pool to begin requesting withdrawal from casper by updating its status
                    pool.updateStatus();
                    // Exit the loop
                    break;
                }
            }
        }
        // Check to see if there are any pools that are awaiting their deposit to be returned from Casper
        poolsFound = getPoolsFilterWithStatus(3);
        // Do we have any pools currently awaiting on their deposit from casper?
        if (poolsFound.length > 0) {
            // Ready for re-entry?
            for (i = 0; i < poolsFound.length; i++) {
                // Get an instance of that pool contract
                pool = getPoolInstance(poolsFound[i]);
                // If the time has passed, we can now request the deposit to be sent
                if (pool.getStakingWithdrawalTimeMet() == true) {
                    // Now set the pool to begin withdrawal from casper by updating its status
                    pool.updateStatus();
                    // Exit the loop
                    break;
                }
            }
        }
    } 

    /*** Mini Pools ***********************************************/

    /// @dev Get an instance of the pool contract
    /// @param _miniPoolAddress The address of the mini pool to get the contract instance of
    function getPoolInstance(address _miniPoolAddress) onlyMiniPool(_miniPoolAddress) private view returns(RocketPoolMini) {
        // Get the pool contract instance
        RocketPoolMini pool = RocketPoolMini(_miniPoolAddress);
        // Double check the contract exists at the given address
        assert(pool.owner() != 0);
        // It exists
        return pool;
    }

    /// @dev Check if this minipool exists in the network
    /// @param _miniPoolAddress The address of the mini pool to check exists
    function getPoolExists(address _miniPoolAddress) view public returns(bool) {
        return rocketStorage.getBool(keccak256("minipool.exists", _miniPoolAddress));
    }

    /// @dev Returns a count of the current minipools
    function getPoolsCount() view public returns(uint256) {
        return rocketStorage.getUint(keccak256("minipools.total"));
    }

    /// @dev Get all pools that match this status (explicit method)
    /// @param _status Get pools with the current status
    function getPoolsFilterWithStatus(uint256 _status) public view returns(address[] memory) {
        return getPoolsFilter(false, _status, 0, 0, 0, false);  
    }

    /// @dev Get all pools that match this status and set staking duration (explicit method)
    /// @param _status Get pools with the current status
    /// @param _stakingDuration Get pools with the current staking duration
    function getPoolsFilterWithStatusAndDuration(uint256 _status, uint256 _stakingDuration) public view returns(address[] memory) {
        return getPoolsFilter(false, _status, 0, _stakingDuration, 0, false);  
    }

    /// @dev Get all pools that are assigned to this node (explicit method)
    /// @param _nodeAddress Get pools with the current node
    function getPoolsFilterWithNode(address _nodeAddress) public view returns(address[] memory) {
        return getPoolsFilter(false, 99, _nodeAddress, 0, 0, false);  
    }

    /// @dev Return count of all pools that are assigned to this node (explicit method)
    /// @param _nodeAddress Get pools with the current node
    function getPoolsFilterWithNodeCount(address _nodeAddress) public view returns(uint256) {
        return getPoolsFilter(false, 99, _nodeAddress, 0, 0, false).length;  
    }

    /// @dev Get all pools that match this user belongs too (explicit method)
    /// @param _userAddress Get pools with the current user
    function getPoolsFilterWithUser(address _userAddress) public view returns(address[] memory) {
        return getPoolsFilter(false, 99, 0, 0, _userAddress, false);
    }

    /// @dev Get all pools that match this user belongs too and has a deposit > 0 (explicit method)
    /// @param _userAddress Get pools with the current user
    function getPoolsFilterWithUserDeposit(address _userAddress) public view returns(address[] memory) {
        return getPoolsFilter(false, 99, 0, 0, _userAddress, true);
    }

    /// @dev Returns all current mini pools (explicit method)
    function getPools() view private returns(address[] memory) {
        return getPoolsFilter(true, 99, 0, 0, 0, false);
    }

    /// @dev Get the address of any pools with the current set status or filter
    /// @param _returnAll Return all mini pools 
    /// @param _status Get pools with the current status
    /// @param _nodeAddress Filter pools that are currently assigned to this node address
    /// @param _stakingDuration The duration that the pool with stake with Casper for
    /// @param _userAddress The address of a user account in the pool
    /// @param _userHasDeposit Filter pools on users that have a deposit > 0 in the pool
    function getPoolsFilter(bool _returnAll, uint256 _status, address _nodeAddress, uint256 _stakingDuration, address _userAddress, bool _userHasDeposit) view private returns(address[] memory) {
        // Get the mini pool count
        uint256 miniPoolCount = getPoolsCount(); 
        // Create an array at the length of the current pools, then populate it
        address[] memory pools = new address[](miniPoolCount);
        address[] memory poolsFound = new address[](miniPoolCount);
        // Retreive each pool address now by index since we are using key/value pair storage
        for (uint32 i = 0; i < pools.length; i++) {
            // Get the address, match the data type for the reverse lookup
            pools[i] = rocketStorage.getAddress(keccak256("minipools.index.reverse", uint256(i)));
            // Get an instance of that pool contract
            RocketPoolMini pool = getPoolInstance(pools[i]);
            // Check the pool meets any supplied filters
            if ((_status < 10 && pool.getStatus() == _status && _stakingDuration == 0) ||
               (_status < 10 && pool.getStatus() == _status && _stakingDuration > 0 && _stakingDuration == pool.getStakingDuration()) || 
               (_userAddress != 0 && pool.getUserExists(_userAddress)) || 
               (_userAddress != 0 && _userHasDeposit == true && pool.getUserHasDeposit(_userAddress)) || 
               (_nodeAddress != 0 && _nodeAddress == pool.getNodeAddress()) || _returnAll == true) {
                // Matched
                poolsFound[i] = pools[i];
            }
        }
        // Remove empty values from our dynamic memory array so that .length works as expected
        poolsFound = utilArrayFilterValuesOnly(poolsFound);
        // Return our pool address matching the status now
        return poolsFound;
    }

    /// @dev Manually update the staking duration of a mini pool if needed, only the owner
    /// @param _miniPoolAddress Address of the minipool.
    /// @param _poolStakingDuration The staking duration of this pool in seconds. Various pools can exist with different durations depending on the users needs.
    function setPoolStakingDuration(address _miniPoolAddress, uint256 _poolStakingDuration) public onlyOwner {
        // Get an instance of that pool contract
        RocketPoolMini pool = getPoolInstance(_miniPoolAddress);
        pool.setStakingDuration(_poolStakingDuration);
    } 
  
    /// @dev Create a new pool 
    /// @param _poolStakingDuration The staking duration of this pool in seconds. Various pools can exist with different durations depending on the users needs.
    function createPool(uint256 _poolStakingDuration) private poolsAllowedToBeCreated onlyLatestRocketPool returns(address) {
        // Create the new pool and add it to our list
        RocketFactoryInterface rocketFactory = RocketFactoryInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketFactory")));
        // Ok make the minipool contract now
        address newPoolAddress = rocketFactory.createRocketPoolMini(_poolStakingDuration);
        // Add the mini pool to the primary persistent storage so any contract upgrades won't effect the current stored mini pools
        // Check it doesn't already exist
        require(!getPoolExists(newPoolAddress));
        // Get how many minipools we currently have  
        uint256 minipoolCountTotal = getPoolsCount(); 
        // Ok now set our data to key/value pair storage
        rocketStorage.setBool(keccak256("minipool.exists", newPoolAddress), true);
        // We store our data in an key/value array, so set its index so we can use an array to find it if needed
        rocketStorage.setUint(keccak256("minipool.index", newPoolAddress), minipoolCountTotal);
        // Update total minipools
        rocketStorage.setUint(keccak256("minipools.total"), minipoolCountTotal + 1);
        // We also index all our data so we can do a reverse lookup based on its array index
        rocketStorage.setAddress(keccak256("minipools.index.reverse", minipoolCountTotal), newPoolAddress);
        // Fire the event
        PoolCreated(newPoolAddress, _poolStakingDuration, now);
        // Return the new pool address
        return newPoolAddress; 
    } 

    /// @dev Remove a mini pool, only mini pools themselves can call this 
    function removePool() public onlyMiniPool(msg.sender) returns(bool) {
        // Remove the pool from our hub storage
        rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        // Existing mini pools are allowed to be closed and selfdestruct when finished, so check they are allowed
        if (rocketSettings.getPoolAllowedToBeClosed()) {
            // Get total minipools
            uint256 minipoolsTotal = rocketStorage.getUint(keccak256("minipools.total"));
            // Now remove this minipools data from storage
            uint256 minipoolsIndex = rocketStorage.getUint(keccak256("minipool.index", msg.sender));
            // Remove the existance flag
            rocketStorage.deleteBool(keccak256("minipool.exists", msg.sender));
            // Delete reverse lookup
            rocketStorage.deleteAddress(keccak256("minipools.index.reverse", minipoolsIndex));
            // Update total
            rocketStorage.setUint(keccak256("minipools.total"), minipoolsTotal - 1);
            // Now reindex the remaining minipools
            minipoolsTotal = rocketStorage.getUint(keccak256("minipools.total"));
            // Loop
            for (uint i = minipoolsIndex+1; i <= minipoolsTotal; i++) {
                address minipoolAddress = rocketStorage.getAddress(keccak256("minipools.index.reverse", i));
                rocketStorage.setUint(keccak256("minipool.index", minipoolAddress), i - 1);
                rocketStorage.setAddress(keccak256("minipools.index.reverse", i - 1), minipoolAddress);
            }
            // Fire the event
            PoolRemoved(msg.sender, now);
            // Success
            return true;   
        }
        return false;
    } 

    /*** UTILITIES ***********************************************/
    /*** Note: Methods here require passing dynamic memory types
    /*** which can't currently be sent to a library contract (I'd prefer to keep these in a lib if possible, but its not atm)
    /*************************************************************/

    /// @dev Returns an memory array of addresses that do not equal 0, can be overloaded to support other types 
    /// @dev This is handy as memory arrays have a fixed size when initialised, this reduces the array to only valid values (so that .length works as you'd like)
    /// @dev This can be made redundant when .push is supported on dynamic memory arrays
    /// @param addressArray An array of a fixed size of addresses
    function utilArrayFilterValuesOnly(address[] memory addressArray) private pure returns (address[] memory) {
        // The indexes for the arrays
        uint[] memory indexes = new uint[](2); 
        indexes[0] = 0;
        indexes[1] = 0;
        // Calculate the length of the non empty values
        for (uint32 i = 0; i < addressArray.length; i++) {
            if (addressArray[i] != 0) {
                indexes[0]++;
            }
        }
        // Create a new memory array at the length of our valid values we counted
        address[] memory valueArray = new address[](indexes[0]);
        // Now populate the array
        for (i = 0; i < addressArray.length; i++) {
            if (addressArray[i] != 0) {
                valueArray[indexes[1]] = addressArray[i];
                indexes[1]++;
            }
        }
        // Now return our memory array with only non empty values at the correct length
        return valueArray;
    }
}
