pragma solidity ^0.4.2;

import "./contract/Owned.sol";
import "./RocketHub.sol";
import "./RocketPoolMini.sol"; 
import "./RocketFactory.sol"; 
import "./interface/RocketSettingsInterface.sol";
import "./lib/Arithmetic.sol";


/// @title First alpha of an Ethereum POS pool - Rocket Pool! - This is the primary upgradable contract
/// @author David Rugendyke

contract RocketPool is Owned {


    /**** RocketPool ************/
    address public rocketHubAddress;
    uint public version;
    uint private minNodeWei;
    bool private depositsAllowed;
    uint private minDepositWei;
    uint private maxDepositWei;
    bool private withdrawalsAllowed;
    uint private minWithdrawalWei;
    uint private maxWithdrawalWei;
    // Are nodes allowed to be set inactive by Rocket Pool automatically
    bool private nodeSetInactiveAutomatic;
    // The duration between node checkins to make the node inactive (server failure, DDOS etc) and prevent new pools being assigned to it
    uint private nodeSetInactiveDuration;
  

     /*** Events ****************/

    event UserAddedToPool(
        address indexed _userAddress,
        address indexed _partnerAddress,
        address indexed _pool,
        uint256 created 
    );

	event Transferred (
        address indexed _from,
        address indexed _to, 
        // Cant have strings indexed due to unknown size, must use a fixed type size and convert string to sha3
        bytes32 indexed _typeOf, 
        uint256 value,
        uint256 created
    );

    event NodeRegistered (
        address indexed _nodeAddress,
        uint256 created
    );

    event NodeCheckin (
        address indexed _nodeAddress,
        uint256 loadAverage,
        uint256 created
    );

    event NodeActiveStatus (
        address indexed _nodeAddress,
        bool indexed _active,
        uint256 created
    );

    event NodeRemoved (
        address indexed _address,
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

    event PoolAssignedToNode (
        address indexed _miniPoolAddress,
        address indexed _nodeAddress,
        uint256 created
    );

    event PoolsGetWithStatus (
        uint256 indexed _status,
        uint256 poolsFound,
        uint256 created
    );

    event PartnerRegistered (
        address indexed _partnerSendFromAddress,
        uint256 created
    );

    event PartnerRemoved (
        address indexed _address,
        uint256 created
    );

    event FlagUint (
        uint256 flag
    );

    event FlagInt (
        int256 flag
    );
    
    

    /*** Modifiers *************/

    /// @dev Deposits must be validated
    modifier acceptableDeposit {
        if (!depositsAllowed || msg.value < minDepositWei || msg.value > maxDepositWei) {
            throw;
        } 
        _;
    }

    /// @dev withdrawals must be validated
    /// @param amount The amount to withdraw
    modifier acceptableWithdrawal(uint256 amount) {
        if (!withdrawalsAllowed || amount < minWithdrawalWei || amount > maxWithdrawalWei) {
            throw;
        } 
        _;
    }

    /// @dev New pools are allowed to be created
    modifier poolsAllowedToBeCreated() {
        // Get the mini pool count
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        RocketSettingsInterface rocketSettings = RocketSettingsInterface(rocketHub.getRocketSettingsAddress());
        // New pools allowed to be created?
        if (!rocketSettings.getPoolAllowedToBeCreated()) {
            throw;
        } 
        _;
    }

    /// @dev Only allow access from the latest version of the RocketPool contract
    modifier onlyLatestRocketPool() {
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        if (this != rocketHub.getRocketPoolAddress()) throw;
        _;
    }

    /// @dev Only allow access from the a RocketMiniPool contract
    modifier onlyMiniPool() {
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        if (!rocketHub.getRocketMiniPoolExists(msg.sender)) throw;
        _;
    }  

   
    /// @dev rocketPool constructor
    function RocketPool(address deployedRocketHubAddress) {
        // Set the address of the main hub
        rocketHubAddress = deployedRocketHubAddress;
        // Set the current version of this contract
        version = 1;
        // Set the min eth needed for a node account to cover gas costs
        minNodeWei = 5 ether;
        // Are deposits allowed atm?
        depositsAllowed = true;
        // Set the min/max deposits 
        minDepositWei = 1 ether;
        maxDepositWei = 75 ether;
        // Are withdrawals allowed atm?
        withdrawalsAllowed = true;
        // Set the min/max withdrawal 
        // Passing 0 as the min amount will withdraw the users total
        minWithdrawalWei = 0 ether;
        maxWithdrawalWei = 10 ether;
        // Nodes
        nodeSetInactiveAutomatic = true;
        nodeSetInactiveDuration = 1 hours;
    }

    /// @dev Set the min eth required for a node to be registered
    /// @param amountInWei The amount in Wei
    function setMinNodeWei(uint amountInWei) public onlyOwner  {
        minNodeWei = amountInWei;
    }

    // @dev Are deposits allowed for this version of Rocket Pool?
    /// @param areDepositsAllowed True or False
    function setDepositsAllowed(bool areDepositsAllowed) public onlyOwner  {
        depositsAllowed = areDepositsAllowed;
    }

    // @dev Set the min amount of Ether required for a deposit in Wei
    /// @param amountInWei The amount in Wei
    function setMinDepositAllowed(uint256 amountInWei) public onlyOwner  {
        minDepositWei = amountInWei;
    }

    // @dev Set the max amount of Ether required for a deposit in Wei
    /// @param amountInWei The amount in Wei
    function setMaxDepositAllowed(uint256 amountInWei) public onlyOwner  {
        maxDepositWei = amountInWei;
    }

    // @dev Are withdrawals allowed for this version of Rocket Pool?
    /// @param areWithdrawalsAllowed True or False
    function setWithdrawalsAllowed(bool areWithdrawalsAllowed) public onlyOwner  {
        withdrawalsAllowed = areWithdrawalsAllowed;
    }

    // @dev Set the min amount of Ether required for a withdrawals in Wei
    /// @param amountInWei The amount in Wei
    function setMinDepositsAllowed(uint256 amountInWei) public onlyOwner  {
        minWithdrawalWei = amountInWei;
    }

    // @dev Set the max amount of Ether required for a withdrawals in Wei
    /// @param amountInWei The amount in Wei
    function setMaxWithdrawalAllowed(uint256 amountInWei) public onlyOwner  {
        maxWithdrawalWei = amountInWei;
    }

    /// @dev Set the duration between node checkins to make the node inactive
    function setNodeSetInactiveDuration(uint256 time) public onlyOwner  {
        nodeSetInactiveDuration = time;
    }

    /// @dev Are nodes allowed to be set inactive by Rocket Pool automatically
    function setNodeSetInactiveAutomatic(bool allowed) public onlyOwner  {
        nodeSetInactiveAutomatic = allowed;
    }

    /// @dev Get the duration between node checkins to make the node inactive
    function getNodeSetInactiveDuration() public constant returns (uint256)  {
        return nodeSetInactiveDuration;
    }

  
     /*** DEFAULT PAYABLE ***********************************************/

   
    /// @notice Send `msg.value ether` Eth from the account of `message.caller.address()`, to an account accessible only by Rocket Pool at `to.address()`.
    /// @dev Fallback function, user direct deposit to Rocket Pool 
    function() public payable {   
        // Direct deposit to Rocket Pool, set partner address to 0 to indicate no partner but an awesome direct Rocket Pool user
        deposit(msg.sender, 0, sha3('default'));
    }

    /// @dev Deposit to Rocket Pool, can be from a user or a partner on behalf of their user
    /// @param userAddress The address of the user whom the deposit belongs too
    /// @param partnerAddress The address of the registered 3rd party partner whom is in control of the supplid user account that the deposit belongs too
    /// @param poolStakingTimeID The ID (bytes32 encoded string) that determines which pool the user intends to join based on the staking time of that pool (3 months, 6 months etc)
    function deposit(address userAddress, address partnerAddress, bytes32 poolStakingTimeID) private acceptableDeposit onlyLatestRocketPool { 
        // Check to verify the supplied mini pool staking time id is legit
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        RocketSettingsInterface rocketSettings = RocketSettingsInterface(rocketHub.getRocketSettingsAddress());
        if(!rocketSettings.getPoolStakingTimeExists(poolStakingTimeID)) {
            throw;
        }else{
            uint256 poolStakingDuration = rocketSettings.getPoolStakingTime(poolStakingTimeID);
        }
        // Assign the user to a matching staking time pool if they don't already belong to one awaiting deposits
        // If no pools are currently available, a new pool for the user will be created
        address poolUserBelongsToo =  userAssignToPool(userAddress, partnerAddress, poolStakingDuration);
        // We have a pool for the user, get the pool to withdraw the users deposit to its own contract account
        RocketPoolMini poolDepositTo = getPoolInstance(poolUserBelongsToo);
        // Get the pool to withdraw the users deposit to its contract balance
        if(poolDepositTo.addDeposit.value(msg.value).gas(100000)(userAddress)) {
            // All good? Fire the event for the new deposit
            Transferred(userAddress, poolUserBelongsToo, sha3('deposit'), msg.value, now);      
        }else{
            throw;
        } 
    }


    /*** USERS ***********************************************/

    /// @dev Assign a new user to the next pool that will deploy
    /// @param newUserAddress New user account
    function userAssignToPool(address newUserAddress, address partnerAddress, uint256 poolStakingDuration) private returns(address)  {
        // The desired pool address to asign the user too, use memory to keep costs down
        address poolAssignToAddress = 0;
        // Check to see if this user is already in the next pool to launch that has the same staking duration period (ie 3 months, 6 months etc)
        address[] memory poolsFound = getPoolsFilterWithStatusAndDuration(0, poolStakingDuration);
        // No pools awaiting? lets make one
        if(poolsFound.length == 0) {
            // Create new pool contract
            poolAssignToAddress = createPool(poolStakingDuration);
        }else{
            // Check to see if there's a pool this user doesn't already have a deposit in, 1 user address per pool
            for(uint32 i = 0; i < poolsFound.length; i++) {
                // Add them to the first available pool accepting deposits
                poolAssignToAddress = poolsFound[i];
            } 
        }     
        // Do we have a valid pool and they are added ok?
        if(poolAssignToAddress != 0) {
            // Get the contract instance
            RocketPoolMini poolAddUserTo = getPoolInstance(poolAssignToAddress);
            // Double check the pools status is accepting deposits
            if(poolAddUserTo.getStatus() == 0) {
                // User is added if they don't exist in it already
                if(poolAddUserTo.addUser(newUserAddress, partnerAddress)) {
                    // Fire the event
                    UserAddedToPool(newUserAddress, partnerAddress, poolAssignToAddress, now);
                } 
                // Return the pool address that the user belongs to
                return poolAssignToAddress;
            }    
        }
        // No available pools and new pool creation has failed, send funds back;
        throw;
    }

    /// @notice Withdraw ether from Rocket Pool
    /// @dev A regular Rocket Pool user withdrawing their deposit
    /// @param miniPoolAddress The address of the mini pool they wish to withdraw from.
    /// @param amount The amount in Wei to withdraw, passing 0 will withdraw the users whole balance.
    function userWithdrawDeposit(address miniPoolAddress, uint256 amount) public returns(bool)  {
        // Call our transfer method, creates a transaction
        userWithdrawDepositFromPoolTransfer(miniPoolAddress, amount, false, 0);
    }

    /// @dev User has requested withdrawing their deposit from a pool, all main checks are done here as this contract is upgradable, but mini pools are not.
    /// @param miniPoolAddress The address of the mini pool they wish to withdraw from.
    /// @param amount The amount in Wei to withdraw, passing 0 will withdraw the users whole balance.
    /// @param partnerWithdrawal Partners can flag this as a withdrawal on behalf of one of their users.
    /// @param partnerUserAddress The address of the partners user to withdraw from and send the funds too.
    function userWithdrawDepositFromPoolTransfer(address miniPoolAddress, uint256 amount, bool partnerWithdrawal, address partnerUserAddress) private acceptableWithdrawal(amount) onlyLatestRocketPool returns(bool)  {
        // Get the hub
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        // Get an instance of that pool contract
        RocketPoolMini pool = getPoolInstance(miniPoolAddress);
        // The address to use for withdrawals, can also be a partner withdrawing on behalf of their user
        address userAddress = partnerWithdrawal == true && rocketHub.getRocketPartnerExists(msg.sender) ? partnerUserAddress : msg.sender;
        // Get the user props now, this will throw if the user doesn't exist in the given pool
        uint256 userBalance = pool.getUserDeposit(userAddress);
        address userPartnerAddress = pool.getUserPartner(userAddress);
        // Now check to see if the given partner matches the users partner
        if(userPartnerAddress != 0 && userPartnerAddress != msg.sender) {
            // The supplied partner for the user does not match the sender
            throw;
        }
        // Check to see if the user is actually in this pool and has a deposit
        if(userBalance > 0) {
            // Check the status, must be accepting deposits, counting down to staking launch to allow withdrawals before staking incase users change their mind or officially awaiting withdrawals after staking
            if(pool.getStatus() == 0 || pool.getStatus() == 1 || pool.getStatus() == 4) {
                    // The pool has now received its deposit +rewards || -penalties from the Casper contract and users can withdraw
                    // Users withdraw all their deposit + rewards at once when the pool has finished staking
                    // We need to update the users balance, rewards earned and fees incurred totals, then allow withdrawals
                    if(pool.getStatus() == 4) {
                        // Update the users new balance, rewards earned and fees incurred
                        if(userUpdateDepositAndRewards(miniPoolAddress, userAddress)) {
                            // Get their updated balance now as they are withdrawing it all
                            amount = pool.getUserDeposit(userAddress);
                        }
                    }
                    // 0 amount or less given withdraws the entire users deposit
                    amount = amount <= 0 ? userBalance : amount;
                    // Ok send the deposit to the user from the mini pool now
                    if(pool.withdraw(userAddress, amount)) {
                        // Successful withdrawal
                        Transferred(miniPoolAddress, userAddress, sha3('withdrawal'), amount, now);    
                        // Success
                        return true; 
                    }
                }
        }
        throw;
    }

    /// @dev Our mini pool has requested to update its users deposit amount and rewards after staking has been completed, all main checks are done here as this contract is upgradable, but mini pools currently deployed are not 
    /// @param userAddress The address of the mini pool user.
    /// @param miniPoolAddress The address of the mini pool they wish to withdraw from.
    function userUpdateDepositAndRewards(address miniPoolAddress, address userAddress) private returns (bool)  {
        // Get the hub
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        // Get our rocket settings 
        RocketSettingsInterface rocketSettings = RocketSettingsInterface(rocketHub.getRocketSettingsAddress());
        // Get an instance of that pool contract
        RocketPoolMini pool = getPoolInstance(miniPoolAddress);
        // Get the current user balance
        uint256 userBalance = pool.getUserDeposit(userAddress);
        // The total the user will be able to withdraw +/- rewards and also minus our fee if applicable
        uint256 userBalanceUpdated = 0;
        // We also store the users calculated rewards so we can see how much the original balance has changed (can be negative if penalties occured)
        int256 userRewardsAmount = 0;
        // If the user has earned rewards by staking, we take our fee from that amount (not the entire deposit)
        uint256 userFeesAmount = 0;
        // Use this as our base unit to remove the decimal place by multiplying and dividing by it since solidity doesn't support reals yet
        uint256 calcBase = 1000000000000000000;
        // Calculate the % of the stake the user had from their original deposit
        uint256 userDepositPercInWei = Arithmetic.overflowResistantFraction(userBalance, calcBase, pool.getStakingBalance());
        // Calculate how much the user deposit has changed based on their original % deposited and the new post Casper balance of the pool
        uint256 userDepositAmountUpdated = Arithmetic.overflowResistantFraction(userDepositPercInWei, pool.getStakingBalanceReceived(), calcBase);
        // Calculate how much rewards the user earned
        userRewardsAmount = int256(userDepositAmountUpdated - userBalance);
        // So only process fees if we've recevied rewards from Casper
        if(userRewardsAmount > 0) {
            // Calculate the fee we take from the rewards now to cover node server costs etc
            userFeesAmount =  Arithmetic.overflowResistantFraction(rocketSettings.getWithdrawalFeePercInWei(), uint256(userRewardsAmount), calcBase);
            // The total the user will receive '(deposit + rewards) - fees'
            userBalanceUpdated = (userDepositAmountUpdated - userFeesAmount);
        }else{
            // Either no rewards have been given, or we've incurred penalites from Casper for some reason (node server failure etc), no fee charged in that case as we've dropped the ball for some reason   
            userBalanceUpdated = userDepositAmountUpdated;
        }
        
        /*
        FlagUint(userBalance);
        FlagUint(pool.getStakingBalance());
        FlagUint(pool.getStakingBalanceReceived());
        FlagUint(rocketSettings.getWithdrawalFeePercInWei());
        FlagUint(0);
        FlagUint(userDepositPercInWei);
        FlagUint(userDepositAmountUpdated);
        FlagInt(userRewardsAmount);
        FlagUint(userFeesAmount);
        FlagUint(userBalanceUpdated);
        FlagUint(0);
        FlagUint(pool.balance - (userBalanceUpdated+userFeesAmount));
        */

        // Update our users updated balance, rewards calculated and fees incurred 
        if(pool.setUserBalanceRewardsFees(userAddress, userBalanceUpdated, userRewardsAmount, userFeesAmount)) {
            return true;
        }
        return false;
    }

 

    /*** POOLS ***********************************************/

    /// @dev Get an instance of the pool contract
    /// @param miniPoolAddress The address of the mini pool to get the contract instance of
    function getPoolInstance(address miniPoolAddress) private constant returns(RocketPoolMini)  {
        // Make sure its one of ours
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        if(rocketHub.getRocketMiniPoolExists(miniPoolAddress)) {
            // Get the pool contract instance
            RocketPoolMini pool = RocketPoolMini(miniPoolAddress);
            // Double check the contract exists at the given address
            if (pool.owner() == 0) {
                throw;
            } else {
                // It exists
                return pool;
            }
        }else{
            throw;
        }
    }

    /// @dev Get all pools that match this status (explicit method)
    /// @param status Get pools with the current status
    function getPoolsFilterWithStatus(uint256 status) constant returns(address[] memory) {
        return getPoolsFilter(false, status, 0, 0, 0, false);  
    }

    /// @dev Get all pools that match this status and set staking duration (explicit method)
    /// @param status Get pools with the current status
    /// @param stakingDuration Get pools with the current staking duration
    function getPoolsFilterWithStatusAndDuration(uint256 status, uint256 stakingDuration) constant returns(address[] memory) {
        return getPoolsFilter(false, status, 0, stakingDuration, 0, false);  
    }

    /// @dev Get all pools that are assigned to this node (explicit method)
    /// @param nodeAddress Get pools with the current node
    function getPoolsFilterWithNode(address nodeAddress) constant returns(address[] memory) {
        return getPoolsFilter(false, 99, nodeAddress, 0, 0, false);  
    }

    /// @dev Get all pools that match this user belongs too (explicit method)
    /// @param userAddress Get pools with the current user
    function getPoolsFilterWithUser(address userAddress) constant returns(address[] memory) {
        return getPoolsFilter(false, 99, 0, 0, userAddress, false);
    }

    /// @dev Get all pools that match this user belongs too and has a deposit > 0 (explicit method)
    /// @param userAddress Get pools with the current user
    function getPoolsFilterWithUserDeposit(address userAddress) constant returns(address[] memory) {
        return getPoolsFilter(false, 99, 0, 0, userAddress, true);
    }

    /// @dev Returns all current mini pools (explicit method)
    function getPools() constant private returns(address[] memory) {
        return getPoolsFilter(true, 99, 0, 0, 0, false);
    }

    /// @dev Get the address of any pools with the current set status or filter
    /// @param returnAll Return all mini pools 
    /// @param status Get pools with the current status
    /// @param nodeAddress Filter pools that are currently assigned to this node address
    /// @param userAddress The address of a user account in the pool
    /// @param userHasDeposit Filter pools on users that have a deposit > 0 in the pool
    function getPoolsFilter(bool returnAll, uint256 status, address nodeAddress, uint256 stakingDuration, address userAddress, bool userHasDeposit) constant private returns(address[] memory) {
        // Get the mini pool count
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        uint256 miniPoolCount = rocketHub.getRocketMiniPoolCount(); 
        // Create an array at the length of the current pools, then populate it
        // This step would be infinitely easier and efficient if you could return variable arrays from external calls in solidity
        address[] memory pools = new address[](miniPoolCount);
        address[] memory poolsFound = new address[](miniPoolCount);
        // Retreive each pool address now by index since we can't return a variable sized array from an external contract yet
        for(uint32 i = 0; i < pools.length; i++) {
            // Get the address
            pools[i] = rocketHub.getRocketMiniPoolByIndex(i);
            // Get an instance of that pool contract
            RocketPoolMini pool = getPoolInstance(pools[i]);
             // Check the pool meets any supplied filters
            if((status < 10 && pool.getStatus() == status && stakingDuration == 0) ||
               (status < 10 && pool.getStatus() == status && stakingDuration > 0 && stakingDuration == pool.getStakingDuration()) || 
               (userAddress != 0 && pool.getUserExists(userAddress)) || 
               (userAddress != 0 && userHasDeposit == true && pool.getUserHasDeposit(userAddress)) || 
               (nodeAddress != 0) || 
               returnAll == true) {
                    // Matched
                    poolsFound[i] = pools[i];
            }
        }
        // Remove empty values from our dynamic memory array so that .length works as expected
        poolsFound = utilArrayFilterValuesOnly(poolsFound);
        // Fire the event
        PoolsGetWithStatus(status, poolsFound.length, now);
        // Return our pool address matching the status now
        return poolsFound;
    }

  
    /// @dev Create a new pool 
    /// @param poolStakingDuration The staking duration of this pool in seconds. Various pools can exist with different durations depending on the users needs.
    function createPool(uint256 poolStakingDuration) private poolsAllowedToBeCreated onlyLatestRocketPool returns(address) {
        // Create the new pool and add it to our list
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        RocketFactory rocketFactory = RocketFactory(rocketHub.getRocketFactoryAddress());
        address newPoolAddress = rocketFactory.createRocketPoolMini(poolStakingDuration);
        // Add the mini pool to the primary persistant storage so any contract upgrades won't effect the current stored mini pools
        // Sets the rocket node if the address is ok and isn't already set
        if(rocketHub.setRocketMiniPool(newPoolAddress)) {
            // Fire the event
            PoolCreated(newPoolAddress, poolStakingDuration, now);
            // Return the new pool address
            return newPoolAddress;
        }    
        throw;
    } 


    /// @dev Remove a mini pool, only mini pools themselves can call this 
    function removePool() onlyMiniPool returns(bool) {
        // Remove the pool from our hub storage
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        RocketSettingsInterface rocketSettings = RocketSettingsInterface(rocketHub.getRocketSettingsAddress());
        // Existing mini pools are allowed to be closed and selfdestruct when finished, so check they are allowed
        if (rocketSettings.getPoolAllowedToBeClosed()) {
           // Sets the rocket node if the address is ok and isn't already set
           if(rocketHub.setRocketMiniPoolRemove(msg.sender)) {
                // Fire the event
                PoolRemoved(msg.sender, now);
                // Success
                return true;
            }    
        }
       return false;
    } 


    /// @dev Manually update the staking duration of a mini pool if needed, only the owner
    /// @param poolStakingDuration The staking duration of this pool in seconds. Various pools can exist with different durations depending on the users needs.
    function updatePoolStakingDuration(address miniPoolAddress, uint256 poolStakingDuration) public onlyOwner {
        // Get an instance of that pool contract
        RocketPoolMini pool = getPoolInstance(miniPoolAddress);
        pool.setStakingDuration(poolStakingDuration);
    } 
   


    /*** NODES ***********************************************/

    /// @dev Register a new node address if it doesn't exist, only the contract creator can do this
    /// @param nodeAccountAddressToRegister New nodes coinbase address
    function nodeRegister(address nodeAccountAddressToRegister, string oracleID, string instanceID) public onlyOwner  {
        // Get the balance of the node, must meet the min requirements to service gas costs for checkins, oracle services etc
        if(nodeAccountAddressToRegister.balance >= minNodeWei) {
            // Add the node to the primary persistant storage so any contract upgrades won't effect the current stored nodes
            RocketHub rocketHub = RocketHub(rocketHubAddress);
            // Sets the rocket node if the address is ok and isn't already set
            if(rocketHub.setRocketNode(nodeAccountAddressToRegister, sha3(oracleID), sha3(instanceID))) {
                // Fire the event
                NodeRegistered(nodeAccountAddressToRegister, now);
            }
        }else{
            throw;
        }
	}


    /// @dev Owner can manually activate or deactivate a node, this will stop the node accepting new pools to be assigned to it
    /// @param nodeAddress Address of the node
    /// @param activeStatus The status to set the node
    function nodeSetActiveStatus(address nodeAddress, bool activeStatus) public onlyOwner {
        // Get our RocketHub contract with the node storage, so we can check the node is legit
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        rocketHub.setRocketNodeActive(nodeAddress, activeStatus);
    }


    /// @dev Nodes will checkin with Rocket Pool at a set interval (15 mins) to do things like report on average node server load, set nodes to inactive that have not checked in an unusally long amount of time etc. Only registered nodes can call this.
    /// @param currentLoadAverage The average server load for the node over the last 15 mins
    function nodeCheckin(bytes32 nodeValidationCode, bytes32 nodeRandao, uint256 currentLoadAverage) public {
        // Get our RocketHub contract with the node storage, so we can check the node is legit
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        RocketPoolMini pool = RocketPoolMini(0);
        // Is this a legit Rocket Node?
        if(rocketHub.getRocketNodeExists(msg.sender)) {
            // Our shared iterator 
            uint32 i = 0;
            // Updates the current 15 min load average on the node, last checkin time etc
            rocketHub.setRocketNodeCheckin(msg.sender, currentLoadAverage, now);
            // Check to see if there are any pools thats launch countdown has expired that need to be launched for staking
            address[] memory poolsFound = getPoolsFilterWithStatus(1);
            // Do we have any pools awaiting launch?
            if(poolsFound.length > 0) {
                // Ready to launch?
                for(i = 0; i < poolsFound.length; i++) {
                    // Get an instance of that pool contract
                    pool = getPoolInstance(poolsFound[i]);
                    // In order to begin staking, a node must be assigned to the pool and the timer for the launch must be past
                    if(pool.getNodeAddress() == 0 && pool.getStakingDepositTimeMet() == true) {
                        // Get a node for this pool to be assigned too
                        address nodeAddress = nodeAvailableForPool();
                        // Assign the pool to our node with the least average work load to help load balance the nodes and the the casper registration details
                        pool.setNodeDetails(nodeAddress, nodeValidationCode, nodeRandao);
                        // Fire the event
                        PoolAssignedToNode(poolsFound[i], nodeAddress, now);
                        // Now set the pool to begin staking with casper by updating its status with the newly assigned node
                        pool.updateStatus();
                    }
                }
            }
            
            // Check to see if there are any pools that are currently staking and are due to request their deposit from Casper
            poolsFound = getPoolsFilterWithStatus(2);
            // Do we have any pools currently staking?
            if(poolsFound.length > 0) {
                // Ready for re-entry?
                for(i = 0; i < poolsFound.length; i++) {
                    // Get an instance of that pool contract
                    pool = getPoolInstance(poolsFound[i]);
                    // Is this currently staking pool due to request withdrawal from Casper?
                    if(pool.getStakingRequestWithdrawalTimeMet() == true) {
                        // Now set the pool to begin requesting withdrawal from casper by updating its status
                        pool.updateStatus();
                    }
                }
            }
            // Check to see if there are any pools that are awaiting their deposit to be returned from Casper
            poolsFound = getPoolsFilterWithStatus(3);
            // Do we have any pools currently awaiting on their deposit from casper?
            if(poolsFound.length > 0) {
                // Ready for re-entry?
                for(i = 0; i < poolsFound.length; i++) {
                    // Get an instance of that pool contract
                    pool = getPoolInstance(poolsFound[i]);
                    // If the time has passed, we can now request the deposit to be sent
                    if(pool.getStakingWithdrawalTimeMet() == true) {
                        // Now set the pool to begin withdrawal from casper by updating its status
                        pool.updateStatus();
                    }
                }
            }
            // Now see what nodes haven't checked in recently and disable them if needed to prevent new pools being assigned to them
            if(nodeSetInactiveAutomatic == true) {
                // Get all the current registered nodes
                uint256 nodeCount = rocketHub.getRocketNodeCount();
                // Create an array at the length of the current nodes, then populate it
                // This step would be infinitely easier and efficient if you could return variable arrays from external calls in solidity
                address[] memory nodes = new address[](nodeCount);
                // Get each node now and check
                for(i = 0; i < nodes.length; i++) {
                    // Get our node address
                    address currentNodeAddress = rocketHub.getRocketNodeByIndex(i);
                    // We've already checked in as this node above
                    if(msg.sender != currentNodeAddress) {
                        // Has this node reported in recently? If not, it may be down or in trouble, deactivate it to prevent new pools being assigned to it
                        if(rocketHub.getRocketNodeLastCheckin(currentNodeAddress) < (now - nodeSetInactiveDuration) && rocketHub.getRocketNodeActive(currentNodeAddress) == true) {
                            // Disable the node - must be manually reactivated by the function above when its back online/running well
                            rocketHub.setRocketNodeActive(currentNodeAddress, false);
                            // Fire the event
                            NodeActiveStatus(currentNodeAddress, false, now);
                        }
                    }
                }
            }
            // Fire the event
            NodeCheckin(msg.sender, currentLoadAverage, now);
        }else{
            throw;
        }
    }


    /// @dev Get an available node for a pool to be assigned too
    // TODO: As well as assigning pools by node user server load, assign by node geographic region to aid in redundancy and decentralisation
    function nodeAvailableForPool() private returns(address) {
        // This is called only by registered Rocket mini pools 
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        // Get all the current registered nodes
        uint256 nodeCount = rocketHub.getRocketNodeCount();
        // Create an array at the length of the current nodes, then populate it
        // This step would be infinitely easier and efficient if you could return variable arrays from external calls in solidity
        address[] memory nodes = new address[](nodeCount);
        address nodeAddressToUse = 0;
        uint256 prevAverageLoad = 0;
        // Retreive each node address now by index since we can't return a variable sized array from an external contract yet
        if(nodes.length > 0) {
            for(uint32 i = 0; i < nodes.length; i++) {
                // Get our node address
                address currentNodeAddress = rocketHub.getRocketNodeByIndex(i);
                // Get the node details
                uint256 averageLoad =  rocketHub.getRocketNodeAverageLoad(currentNodeAddress);
                bool active =  rocketHub.getRocketNodeActive(currentNodeAddress);
                // Get the node with the lowest current work load average to help load balancing and avoid assigning to any servers currently not activated
                nodeAddressToUse = (averageLoad <= prevAverageLoad || i == 0) && active == true ? currentNodeAddress : nodeAddressToUse;
                prevAverageLoad = averageLoad;
            }
            // We have an address to use, excellent, assign it
            if(nodeAddressToUse != 0) {
                return nodeAddressToUse;
            }
        }
        // No registered nodes yet
        throw; 
    } 


    /// @dev Remove a node from the Rocket Pool network
    function nodeRemove(address nodeAddress) public onlyOwner {
        // Check the node doesn't currently have any registered mini pools associated with it
        if(getPoolsFilterWithNode(nodeAddress).length == 0) {
            // Remove node from the primary persistant storage
            RocketHub rocketHub = RocketHub(rocketHubAddress);
            // Sets the rocket partner if the address is ok and isn't already set
            if(rocketHub.setRocketNodeRemove(nodeAddress)) {
                // Fire the event
                NodeRemoved(nodeAddress, now);
            }
        }else{
            throw;
        }
    } 
    

    /*** PARTNERS ***********************************************/

    /// @dev Register a new partner address if it doesn't exist, only the contract creator can do this
    /// @param partnerAccountAddressToRegister The msg.sender address the partner will use
    /// @param partnerName The msg.sender address the partner will use
    function partnerRegister(address partnerAccountAddressToRegister, string partnerName) public onlyOwner  {
        // Add the partner to the primary persistant storage so any contract upgrades won't effect the current stored partners
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        // Sets the rocket partner if the address is ok and isn't already set
        if(rocketHub.setRocketPartner(partnerAccountAddressToRegister, sha3(partnerName))) {
            // Fire the event
            PartnerRegistered(partnerAccountAddressToRegister, now);
        }
	}

    /// @notice Send `msg.value ether` Eth from the account of `message.caller.address()`, to an account accessible only by Rocket Pool at `to.address()` with partner address `partnerAddress`.
    /// @dev Deposit to Rocket Pool via a partner on behalf of their user
    /// @param partnerUserAddress The address of the user whom the deposit belongs too and the 3rd party is in control of
    /// @param poolStakingTimeID The ID (bytes32 encoded string) that determines which pool the user intends to join based on the staking time of that pool (3 months, 6 months etc)
    function partnerDeposit(address partnerUserAddress, bytes32 poolStakingTimeID) public payable { 
        // If the user is not a direct Rocket Pool user but a partner user, check the partner is legit
        // The partner address being supplied must also match the sender address
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        // If the partner does not exist, exit
        if(!rocketHub.getRocketPartnerExists(msg.sender)) {
            throw;
        }
        // Make the deposit now and validate it
        deposit(partnerUserAddress, msg.sender, poolStakingTimeID);
    }

    /// @notice Withdraw ether from Rocket Pool via a 3rd party partner
    /// @dev A 3rd party partner Rocket Pool user withdrawing their users deposit
    /// @param miniPoolAddress The address of the mini pool they wish to withdraw from.
    /// @param amount The amount in Wei to withdraw, passing 0 will withdraw the users whole balance.
    /// @param partnerUserAddress The address of the partners user to withdraw from and send the funds too.
    function partnerWithdrawDeposit(address miniPoolAddress, uint256 amount, address partnerUserAddress) public returns(bool)  {
        // Call our transfer method, creates a transaction
        userWithdrawDepositFromPoolTransfer(miniPoolAddress, amount, true, partnerUserAddress);
    }


    /// @dev Remove a partner from the Rocket Pool network
    function partnerRemove(address partnerAddress) public onlyOwner {
         // Remove partner from the primary persistant storage
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        // Sets the rocket partner if the address is ok and isn't already set
        if(rocketHub.setRocketPartnerRemove(partnerAddress)) {
            // Fire the event
            PartnerRemoved(partnerAddress, now);
        }
    } 
    


    /*** UTILITIES ***********************************************/
    /*** Note: Methods here require passing dynamic memory types
    /*** which can't currently be sent to a library contract (I'd prefer to keep these in a lib if possible, but its not atm)
    /*************************************************************/

    /// @dev Returns an memory array of addresses that do not equal 0, can be overloaded to support other types 
    /// @dev This is handy as memory arrays have a fixed size when initialised, this reduces the array to only valid values (so that .length works as you'd like)
    /// @dev This can be made redundant when .push is supported on dynamic memory arrays
    /// @param addressArray An array of a fixed size of addresses
	function utilArrayFilterValuesOnly(address[] memory addressArray) private constant returns (address[] memory)
	{
        // The indexes for the arrays
        uint[] memory indexes = new uint[](2); 
        indexes[0] = 0;
        indexes[1] = 0;
        // Calculate the length of the non empty values
		for(uint32 i = 0; i < addressArray.length; i++) {
            if(addressArray[i] != 0) {
                indexes[0]++;
            }
        }
        // Create a new memory array at the length of our valid values we counted
        address[] memory valueArray = new address[](indexes[0]);
        // Now populate the array
        for(i = 0; i < addressArray.length; i++) {
            if(addressArray[i] != 0) {
                valueArray[indexes[1]] = addressArray[i];
                indexes[1]++;
            }
        }
        // Now return our memory array with only non empty values at the correct length
        return valueArray;
	}

}
