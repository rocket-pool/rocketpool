pragma solidity ^0.4.8;

import "./RocketHub.sol";
import "./interface/RocketSettingsInterface.sol";
import "./interface/RocketPoolInterface.sol";
import "./interface/CasperInterface.sol";
import "./contract/Owned.sol";
import "./lib/Arithmetic.sol";


/// @title The minipool delegate, should contain all primary logic for methods that minipools use, is entirely upgradable so that currently deployed pools can get any bug fixes or additions - storage here MUST match the minipool contract
/// @author David Rugendyke

contract RocketPoolMiniDelegate is Owned {

    /**** Properties ***********/

    // Hub address
    address private rocketHubAddress;
    // Node this minipool is attached to
    address private rocketNodeAddress;
    // Node validation code for Casper
    bytes32 private rocketNodeValidationCode;
    // Node randao for Casper
    bytes32 private rocketNodeRandao;
    // The time this pool will stake for before withdrawal is allowed (seconds)
    uint256 private stakingDuration;
    // The ether balance sent to stake from the pool
    uint256 private stakingBalance;
    // The ether balance sent to the pool after staking was completed in Casper
    uint256 private stakingBalanceReceived;
    // Users in this pool
    mapping (address => User) private users;
    // Users backup withdrawal address => users current address in this pool, need these in a mapping so we can do a reverse lookup using the backup address
    mapping (address => address) private usersBackupAddress;
    // Keep an array of all our user addresses for iteration
    address[] private userAddresses;
    // The current status of this pool, statuses are declared via Enum in the main hub
    uint256 private status;
    // The timestamp the status changed
    uint256 private statusChangeTime;
    // The total deposit tokes owed by the minipool
    uint256 private depositTokensWithdrawnTotal;
    // The current version of this pool
    uint8 private version;

    
    /*** Structs ***************/

    struct User {
        // Address of the user
        address userAddress;
        // Backup address for the user, if the deposit is not collected when ready for a certain time limit, this address will be allowed to collect it
        address userAddressBackupWithdrawal;
        // Address of the partner of whom has control of the users address
        address partnerAddress;
        // Balance deposited
        uint256 balance;
        // Rewards received after Casper
        int256 rewards;
        // Rocket Pool deposit tokens withdrawn
        uint256 depositTokensWithdrawn;
        // Rocket Pool fees incured
        uint256 fees;
        // True if the mapping exists for the user
        bool exists;
        // When the user was created
        uint created;
    }

      
    /*** Events ****************/

    event PoolTransfer (
        address indexed _from,
        address indexed _to, 
        // Cant have strings indexed due to unknown size, must use a fixed type size and convert string to sha3
        bytes32 indexed _typeOf, 
        uint256 value,
        uint256 balance,
        uint256 created
    );

    event UserAdded (
        address indexed _userAddress,
        uint256 created
    );

    event DepositReceived (
        address indexed _userAddress,
        uint256 amount,
        uint256 created
    );

    event StatusChange (
        uint256 indexed _statusCodeNew,
        uint256 indexed _statusCodeOld,
        uint256 created
    );

    event FlagUint (
        uint256 flag
    );

     event FlagAddress (
        address flag
    );

   

    /*** Modifiers *************/

    /// @dev Only registered users with this pool
    /// @param userAddress The users address.
    modifier isPoolUser(address userAddress) {
        if (userAddress == 0 || users[userAddress].exists == false) throw;
        _;
    }


    /// @dev Only allow access from the latest version of the RocketPool contract
    modifier onlyLatestRocketPool() {
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        if (msg.sender != rocketHub.getRocketPoolAddress()) throw;
        _;
    }

    
    /*** Methods *************/
   
   function RocketPoolMiniDelegate(address deployedRocketHubAddress) {
        // Set the address of the main hub
        rocketHubAddress = deployedRocketHubAddress;
    }


    /// @dev Returns true if this pool is able to send a deposit to Casper
    function getStakingDepositTimeMet() public constant returns(bool)   {
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        RocketSettingsInterface rocketSettings = RocketSettingsInterface(rocketHub.getRocketSettingsAddress());
        if(now >= (statusChangeTime + rocketSettings.getPoolCountdownTime())) {
            return true;
        }
        return false;
    }

    /// @dev Returns true if this pool is able to request withdrawal from Casper
    function getStakingRequestWithdrawalTimeMet() public constant returns(bool)   {
        if(now >= (statusChangeTime + stakingDuration)) {
            return true;
        }
        return false;
    }

    /// @dev Returns true if this pool is able to withdraw its deposit + rewards from Casper
    function getStakingWithdrawalTimeMet() public constant returns(bool)   {
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        CasperInterface casper = CasperInterface(rocketHub.getCasperAddress());
        // Now I'm assuming this method will exist for obvious reasons in Casper, but if it doesn't we can change this to work the same by adding
        // a new setting to RocketSettings that can match the delay required by Casper
        if(now >= casper.getWithdrawalEpoch(this)) {
            return true;
        }
        return false; 
    }



    /*** USERS ***********************************************/

    /// @dev Returns the user count for this pool
    function getUserCount() public constant returns(uint256)   {
        return userAddresses.length;
    }

    
    /// @dev Rocket Pool updating the users balance, rewards earned and fees occured after staking and rewards are included
    function setUserBalanceRewardsFees(address userAddress, uint256 updatedBalance, int256 updatedRewards, uint256 updatedFees) public isPoolUser(userAddress) onlyLatestRocketPool returns(bool)   {
        if(status == 4) {
            users[userAddress].balance = updatedBalance;
            users[userAddress].rewards = updatedRewards;
            users[userAddress].fees = updatedFees;
            return true;
        }
        return false;
    }

    /// @dev Set the backup address for the user to collect their deposit + rewards from if the primary address doesn't collect it after a certain time period
    function setUserAddressBackupWithdrawal(address userAddress, address userAddressBackupWithdrawalNew) public isPoolUser(userAddress) onlyLatestRocketPool returns(bool)   {
        // This can only be set before staking begins
        if(status == 0 || status == 1) {
            usersBackupAddress[userAddressBackupWithdrawalNew] = userAddress;
            return true;
        }
        throw;
    }

    /// @dev Set current users address to the supplied backup one - be careful with this method when calling from the main Rocket Pool contract, all primary logic must be contained there as its upgradable
    function setUserAddressToCurrentBackupWithdrawal(address userAddress, address userAddressBackupWithdrawalGiven) public isPoolUser(userAddress) onlyLatestRocketPool returns(bool)   {
        // This can only be called when staking has been completed, do some quick double checks here too
        if(status == 4 && usersBackupAddress[userAddressBackupWithdrawalGiven] == userAddress) {
            // Copy the mapping struct with the existing users details
            users[userAddressBackupWithdrawalGiven] = users[userAddress];
            // Add the user to the array of addresses
            userAddresses.push(userAddressBackupWithdrawalGiven);
            // Now remove the old user
            removeUser(userAddress);
            // All good
            return true;
        }
        return false;
    }


    /// @dev Adds more to the current amount of deposit tokens owed by the user
    function setUserDepositTokensOwedAdd(address userAddress, uint256 etherAmount, uint256 tokenAmount) public isPoolUser(userAddress) onlyLatestRocketPool returns(bool)   {
        // Some basic double checks here, primary logic is in the main Rocket Pool contract
        if(etherAmount > 0 && etherAmount <= users[userAddress].balance) {
            // Balance starting
            FlagUint(users[userAddress].balance);
            // Update their token amount
            users[userAddress].depositTokensWithdrawn += tokenAmount;
            // Update the pool token total
            depositTokensWithdrawnTotal += tokenAmount;
            // 1 ether = 1 token, deduct from their deposit
            users[userAddress].balance -= etherAmount;
            // Balances now
            FlagUint(users[userAddress].balance);
            FlagUint(etherAmount);
            FlagUint(tokenAmount);
            // Sweet
            return true;
        }
        return false;
    }


    /// @dev Register a new user, only the latest version of the parent pool contract can do this
    /// @param userAddressToAdd New user address
    /// @param partnerAddressToAdd The 3rd party partner the user may belong too
    function addUser(address userAddressToAdd, address partnerAddressToAdd) public onlyLatestRocketPool returns(bool)  {
        // Address exists?
        if (userAddressToAdd != 0) {
            // Check the user isn't already registered
            if(users[userAddressToAdd].exists == false) {
                // Add the new user to the mapping of User structs
                users[userAddressToAdd] = User({
                    userAddress: userAddressToAdd,
                    userAddressBackupWithdrawal: 0,
                    partnerAddress: partnerAddressToAdd,
                    balance: 0,
                    rewards: 0,
                    depositTokensWithdrawn: 0,
                    fees: 0,
                    exists: true,
                    created: now
                });
                // Store our node address so we can iterate over it if needed
                userAddresses.push(userAddressToAdd);
                // Fire the event
                UserAdded(userAddressToAdd, now);
                // Success
                return true;
            }else{
                return false;
            }
        }
        throw;
    }


    /// @dev Removes a user from the pool
    /// @param userAddressToRemove The users address
    function removeUser(address userAddressToRemove) private returns(bool) {
        // Get the index of the user and remove them from the array of addresses
        uint i = 0;
        bool found = false;
        for(i=0; i < userAddresses.length; i++) {
            if(userAddresses[i] == userAddressToRemove) {
                found = true;
                for (uint x = i; x < userAddresses.length-1; x++){
                    userAddresses[x] = userAddresses[x+1];
                }
                delete userAddresses[userAddresses.length-1];
                userAddresses.length--;
            }
        }
        // Did we find them?
        if(found) {
            // Now remove from our mapping struct
            users[userAddressToRemove].exists = false;
            users[userAddressToRemove].userAddress = 0;
            users[userAddressToRemove].userAddressBackupWithdrawal = 0;
            users[userAddressToRemove].partnerAddress = 0;
            users[userAddressToRemove].balance = 0;
            users[userAddressToRemove].rewards = 0;
            users[userAddressToRemove].depositTokensWithdrawn = 0;
            users[userAddressToRemove].fees = 0;
            users[userAddressToRemove].created = 0;
            // Update the status of the pool if needed
            updateStatus();
            // All good
            return true;
        }
        return false;
    }


    /*** POOL ***********************************************/

    
    /// @dev Allow the user to withdraw their deposit, only possible if the pool is in prelaunch, in countdown to launch or when Casper staking is completed, only the latest main RocketPool contract can make a withdrawal which is where the main checks occur (its upgradable)
    /// @param withdrawAmount amount you want to withdraw
    /// @return The balance remaining for the user
    function withdraw(address userAddress, uint withdrawAmount) public onlyLatestRocketPool returns (bool) {
        // Now check balances are legit
        if(users[userAddress].balance >= withdrawAmount) {
            // Deduct the balance right away, before sending to avoid potential recursive calls that allow a user to withdraw an amount greater than their deposit
            users[userAddress].balance -= withdrawAmount;
            // Did it send ok?
            if (!userAddress.send(withdrawAmount)) {
                // Nope, add the amount back to the users account
                users[userAddress].balance += withdrawAmount;
                // Fail
                return false;
            }else{
                // All good? Fire the event for the withdrawal
                PoolTransfer(this, userAddress, sha3('withdrawal'), withdrawAmount, users[userAddress].balance, now);
                // Remove this user if they don't have any funds left in this pool
                if(users[userAddress].balance <= 0) {
                    // Has this user incurred any fees? I
                    if(users[userAddress].fees > 0) {
                        // Get the settings to determine the status
                        RocketHub rocketHub = RocketHub(rocketHubAddress);
                        RocketSettingsInterface rocketSettings = RocketSettingsInterface(rocketHub.getRocketSettingsAddress());
                        // Transfer the fee amount now
                        if(rocketSettings.getWithdrawalFeeDepositAddress().send(users[userAddress].fees)) {
                            // All good? Fire the event for the fee transfer
                            PoolTransfer(this, rocketSettings.getWithdrawalFeeDepositAddress(), sha3('fee'), users[userAddress].fees, users[userAddress].balance, now);
                        }
                    }
                    // Remove the user from the pool now they dont have a balance
                    removeUser(userAddress);
                }
                // Update the status of the pool
                updateStatus();
                // Success
                return true;
            }
        }
        throw;
    }

   
    /// @dev Sets the status of the pool based on several parameters 
    function updateStatus() public returns(bool) {
        // Get the settings to determine the status
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        // Set our status now - see RocketSettings.sol for pool statuses and keys
        RocketSettingsInterface rocketSettings = RocketSettingsInterface(rocketHub.getRocketSettingsAddress());
        // Get Caspers function signatures using our interface
        CasperInterface casper = CasperInterface(rocketHub.getCasperAddress());
        // Function returns are stored in memory rather than storage
        uint256 minPoolWeiRequired = rocketSettings.getPoolMinEtherRequired();
        uint256 statusOld = status;
        // If the pool has no users, it means all users have withdrawn deposits remove this pool and we can exit now
        if(getUserCount() == 0) {
            // Remove the pool from RocketHub via the latest RocketPool contract
            RocketPoolInterface rocketPool = RocketPoolInterface(rocketHub.getRocketPoolAddress());
            if(rocketPool.removePool()) {
                // Set the status now just incase self destruct fails for any reason
                status = 5;
                // See if any rocket deposit tokens have been taken out
                if(depositTokensWithdrawnTotal > 0) {
                    // Ok, since 1 ether = 1 token, send the corro
                }
                // Log any dust remaining from fractions being sent when the pool closes
                PoolTransfer(this, rocketSettings.getWithdrawalFeeDepositAddress(), sha3('poolClosing'), this.balance, 0, now);
                // Now self destruct and send any dust left over
                selfdestruct(rocketSettings.getWithdrawalFeeDepositAddress());
            }
            return;
        }
        // Set to awaiting status and deposits if a user has withdrawn their deposit while in countdown and the min required wei for launch is now lower than required
        if(this.balance < minPoolWeiRequired && status == 1) {
            status = 0;
        }
        // Set to countdown for staking, no longer accepting deposits but users can withdraw during this time if they change their mind
        if(this.balance >= minPoolWeiRequired && status == 0) {
            status = 1;
        }
        // If all the parameters for staking are ok and a rocketNodeAddress has been set by the node checkin, we are now ready for staking
        if(this.balance >= minPoolWeiRequired && status == 1 && rocketNodeAddress != 0  && stakingBalance == 0 && getStakingDepositTimeMet() == true) { 
            // Set our current staking balance
            stakingBalance = this.balance;
            // Send our mini pools balance to casper now with our assigned nodes details
            // TODO: rocketNodeValidationCode is currently spec'd as 'bytes' in the Mauve paper, this is a variable length type that cannot be passed from contract to contract at the moment
            // This prevents the below working currently, so rocketNodeValidationCode has been changed to 'bytes32' for now until they get around to implementing passing variable memory types ( https://github.com/ethereum/EIPs/pull/211 )
            // If for some reason this isn't implemented by the time Casper is ready, we can simply send the deposit to the mini pools assigned node who can act as an oracle then send the bytes code along with the Ether directly from the node via the nodejs service script            
            if(casper.deposit.value(this.balance).gas(400000)(rocketNodeValidationCode, rocketNodeRandao, this)) {
                // Set the mini pool status as staking
                status = 2;
                // All good? Fire the event for the new casper transfer
                PoolTransfer(this, rocketHub.getCasperAddress(), sha3('casperDeposit'), stakingBalance, 0, now); 
            }else{
                stakingBalance = 0;
            }        
        }
        // Are we all set to request withdrawal of our deposit from Casper?
        if(stakingBalance > 0 && status == 2 && getStakingRequestWithdrawalTimeMet() == true) { 
            // Request withdrawal now
            if(casper.startWithdrawal()) {
                // Set the mini pool status as having requested withdrawal
                status = 3;
            }
        }
        // Are we all set to actually withdraw our deposit + rewards from Casper?
        if(stakingBalance > 0 && status == 3 && getStakingWithdrawalTimeMet() == true) {
            // Request withdrawal now
            if(casper.withdraw(false)) {
                // Set the mini pool status as having completed withdrawal, users can now withdraw
                status = 4;
            }
        }
        // Fire the event if the status has changed
        if(status != statusOld) {
            statusChangeTime = now;
            StatusChange(status, statusOld, now);
        } 
    }
    

}
