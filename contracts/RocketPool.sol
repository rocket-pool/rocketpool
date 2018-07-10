pragma solidity 0.4.23;

import "./RocketBase.sol";
import "./RocketPoolMini.sol"; 
import "./interface/RocketUserInterface.sol";
import "./interface/RocketFactoryInterface.sol";
import "./interface/RocketNodeInterface.sol";
import "./interface/RocketStorageInterface.sol";
import "./interface/RocketSettingsInterface.sol";


/// @title First alpha of an Ethereum POS pool - Rocket Pool! - This is main pool management contract
/// @author David Rugendyke
contract RocketPool is RocketBase {

    /*** Contracts **************/

    RocketUserInterface rocketUser = RocketUserInterface(0);              // The main user interface methods
    RocketSettingsInterface rocketSettings = RocketSettingsInterface(0);  // The main settings contract most global parameters are maintained
  
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
        require(rocketSettings.getMiniPoolAllowedToBeCreated() == true);
        _;
    }

    /// @dev Only allow access from the latest version of the RocketPool contract
    modifier onlyLatestRocketPool() {
        require(this == rocketStorage.getAddress(keccak256("contract.name", "rocketPool")));
        _;
    }

    /// @dev Only allow access from the latest version of the main RocketNode contract
    modifier onlyLatestRocketNode() {
        bool isRocketNodeAdmin = msg.sender == rocketStorage.getAddress(keccak256("contract.name", "rocketNodeAdmin"));
        bool isRocketNodeStatus = msg.sender == rocketStorage.getAddress(keccak256("contract.name", "rocketNodeStatus"));
        bool isRocketNodeValidator = msg.sender == rocketStorage.getAddress(keccak256("contract.name", "rocketNodeValidator"));
        require(isRocketNodeAdmin || isRocketNodeValidator || isRocketNodeStatus);
        _;
    } 

    /// @dev Only allow access from the latest version of the main RocketUser contract
    modifier onlyLatestRocketUser() {
        require(msg.sender == rocketStorage.getAddress(keccak256("contract.name", "rocketUser")));
        _;
    } 

    /// @dev Only registered pool node addresses can access
    /// @param _minipoolAddress pool account address.
    modifier onlyMiniPool(address _minipoolAddress) {
        require(rocketStorage.getBool(keccak256("minipool.exists", _minipoolAddress)));
        _;
    }

    
    /*** Constructor *************/

    /// @dev rocketPool constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
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
            if(!poolAddUserTo.getUserExists(_newUserAddress) && poolAddUserTo.addUser(_newUserAddress, _partnerAddress)) {
                // Fire the event
                emit PoolAssignedUser(_newUserAddress, _partnerAddress, poolAssignToAddress, now);
            }
            // Return the pool address that the user belongs to
            return poolAssignToAddress;
        } 
    }

    /// @dev See if there are any pools thats launch countdown has expired that need to be launched for staking
    /// @dev This method is designed to only process one minipool status type from each node checkin every 15 mins to prevent the gas block limit from being exceeded and make load balancing more accurate
    function poolNodeActions() external onlyLatestRocketNode {
        // Get our Rocket Node contract
        RocketNodeInterface rocketNode = RocketNodeInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketNodeAdmin")));
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
                require(address(pool) != 0x0);
                // In order to begin staking, a node must be assigned to the pool and the timer for the launch must be past
                if (pool.getNodeAddress() == 0 && pool.getCanDeposit() == true) {
                    // Get a node for this pool to be assigned too
                    address nodeAddress = rocketNode.getNodeAvailableForPool();
                    // Assign the pool to our node with the least average work load to help load balance the nodes and the the casper registration details
                    pool.setNodeOwner(nodeAddress); 
                    // Set this nodes validation code for the minipool to use
                    pool.setNodeValCodeAddress(rocketNode.getNodeValCodeAddress(nodeAddress)); 
                    // Fire the event
                    emit PoolAssignedToNode(poolsFound[i], nodeAddress, now);
                    // Now set the pool to begin staking with casper by updating its status with the newly assigned node
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
                if (pool.getCanWithdraw() == true) {
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
        assert(address(pool) != 0x0);
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

    /// @dev Returns a count of the current active minipools (accepting deposits, in countdown or staking)
    function getActivePoolsCount() view public returns(uint256) {
        return rocketStorage.getUint(keccak256("minipools.active.total"));
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

    /// @dev Return all pools that are assigned to this node and have the current status (explicit method)
    /// @param _nodeAddress Get pools with the current node
    /// @param _status Pool status to filter pools
    function getPoolsFilterWithNodeWithStatus(address _nodeAddress, uint256 _status) public view returns(address[]) {
        return getPoolsFilter(false, _status, _nodeAddress, 0, 0, false);  
    }

    /// @dev Return count of all pools that are assigned to this node and have the current status (explicit method)
    /// @param _nodeAddress Get pools with the current node
    function getPoolsFilterWithNodeWithStatusCount(address _nodeAddress, uint256 _status) public view returns(uint256) {
        return getPoolsFilter(false, _status, _nodeAddress, 0, 0, false).length;  
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
               (_nodeAddress != 0 && _nodeAddress == pool.getNodeAddress()) ||
                _returnAll == true) {
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
        uint256 minipoolActiveCountTotal = getActivePoolsCount();
        // Ok now set our data to key/value pair storage
        rocketStorage.setBool(keccak256("minipool.exists", newPoolAddress), true);
        // We store our data in an key/value array, so set its index so we can use an array to find it if needed
        rocketStorage.setUint(keccak256("minipool.index", newPoolAddress), minipoolCountTotal);
        // Update total minipools
        rocketStorage.setUint(keccak256("minipools.total"), minipoolCountTotal + 1);
        rocketStorage.setUint(keccak256("minipools.active.total"), minipoolActiveCountTotal + 1);
        // We also index all our data so we can do a reverse lookup based on its array index
        rocketStorage.setAddress(keccak256("minipools.index.reverse", minipoolCountTotal), newPoolAddress);
        // Fire the event
        emit PoolCreated(newPoolAddress, _poolStakingDuration, now);
        // Return the new pool address
        return newPoolAddress; 
    } 

    /// @dev Remove a mini pool, only mini pools themselves can call this 
    function removePool() public onlyMiniPool(msg.sender) returns(bool) {
        // Remove the pool from our hub storage
        rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        // Existing mini pools are allowed to be closed and selfdestruct when finished, so check they are allowed
        if (rocketSettings.getMiniPoolClosingEnabled()) {
            // Get total minipools
            uint256 minipoolsTotal = rocketStorage.getUint(keccak256("minipools.total"));
            // Now remove this minipools data from storage
            uint256 removedMinipoolIndex = rocketStorage.getUint(keccak256("minipool.index", msg.sender));
            // Remove the existance flag
            rocketStorage.deleteBool(keccak256("minipool.exists", msg.sender));
            // Update total
            minipoolsTotal = minipoolsTotal - 1;
            rocketStorage.setUint(keccak256("minipools.total"), minipoolsTotal);
            // Removed minipool before end of list - move last minipool to removed minipool index
            if (removedMinipoolIndex < minipoolsTotal) {
                address lastMinipoolAddress = rocketStorage.getAddress(keccak256("minipools.index.reverse", minipoolsTotal));
                rocketStorage.setUint(keccak256("minipool.index", lastMinipoolAddress), removedMinipoolIndex);
                rocketStorage.setAddress(keccak256("minipools.index.reverse", removedMinipoolIndex), lastMinipoolAddress);
                rocketStorage.deleteAddress(keccak256("minipools.index.reverse", minipoolsTotal));
            }
            // Removed minipool at end of list - delete reverse lookup
            else {
                rocketStorage.deleteAddress(keccak256("minipools.index.reverse", removedMinipoolIndex));
            }
            // Fire the event
            emit PoolRemoved(msg.sender, now);
            // Success
            return true;   
        }
        return false;
    } 

    /// @dev Returns the address for the Casper smart contract
    function getCasperAddress() public view returns(address) {
        return rocketStorage.getAddress(keccak256("contract.name", "casper"));
    }

    /// @dev Cast Casper votes via minipools 
    /// @param _nodeAddress The address of the node calling vote
    /// @param _epoch The epoch number voting relates to
    /// @param _minipoolAddress The address of the minipool that should cast the votes
    /// @param _voteMessage Vote message to be sent to Casper
    function vote(address _nodeAddress, uint256 _epoch, address _minipoolAddress, bytes _voteMessage) public onlyLatestRocketNode returns(bool) {
        // Get the minipool
        RocketPoolMini pool = getPoolInstance(_minipoolAddress);
        // Make sure the node is attached to the pool it is trying to vote with
        require(pool.getNodeAddress() == _nodeAddress);
        // Cast the vote
        require(pool.vote(_epoch, _voteMessage));
        // Done
        return true;
    }

    /// @dev Log the minipool out of Casper and wait for withdrawal
    /// @param _nodeAddress The address of the node calling logout
    /// @param _minipoolAddress The address of the minipool to logout of Casper
    /// @param _logoutMessage The constructed logout message from the node containing RLP encoded: [validator_index, epoch, node signature]
    function logout(address _nodeAddress, address _minipoolAddress, bytes _logoutMessage) public onlyLatestRocketNode returns(bool) {
        // Get the minipool
        RocketPoolMini pool = getPoolInstance(_minipoolAddress);
        // Make sure the node is attached to the pool it is trying to logout
        require(pool.getNodeAddress() == _nodeAddress);
        // Ask the minipool send logout to Casper
        pool.logout(_logoutMessage);
        // Decrement active minipool count
        uint256 minipoolActiveCountTotal = getActivePoolsCount();
        if (minipoolActiveCountTotal > 0) {
            rocketStorage.setUint(keccak256("minipools.active.total"), minipoolActiveCountTotal - 1);
        }
        // Done
        return true;
    }

    /*** UTILITIES ***********************************************/
    /*** Note: Methods here require passing dynamic memory types
    /*** which can't currently be sent to a library contract (I'd prefer to keep these in a lib if possible, but its not atm)
    /*************************************************************/

    /// @dev Returns an memory array of addresses that do not equal 0, can be overloaded to support other types 
    /// @dev This is handy as memory arrays have a fixed size when initialised, this reduces the array to only valid values (so that .length works as you'd like)
    /// @dev This can be made redundant when .push is supported on dynamic memory arrays
    /// @param _addressArray An array of a fixed size of addresses
    function utilArrayFilterValuesOnly(address[] memory _addressArray) private pure returns (address[] memory) {
        // The indexes for the arrays
        uint[] memory indexes = new uint[](2); 
        indexes[0] = 0;
        indexes[1] = 0;
        // Calculate the length of the non empty values
        for (uint32 i = 0; i < _addressArray.length; i++) {
            if (_addressArray[i] != 0) {
                indexes[0]++;
            }
        }
        // Create a new memory array at the length of our valid values we counted
        address[] memory valueArray = new address[](indexes[0]);
        // Now populate the array
        for (i = 0; i < _addressArray.length; i++) {
            if (_addressArray[i] != 0) {
                valueArray[indexes[1]] = _addressArray[i];
                indexes[1]++;
            }
        }
        // Now return our memory array with only non empty values at the correct length
        return valueArray;
    }
}