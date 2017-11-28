pragma solidity 0.4.18;

import 'zeppelin-solidity/contracts/math/SafeMath.sol'; 

import "./RocketDepositToken.sol"; 
import "./interface/RocketStorageInterface.sol";
import "./interface/RocketSettingsInterface.sol";
import "./interface/RocketPoolInterface.sol";
import "./interface/CasperInterface.sol";
import "./contract/Owned.sol";
import "./lib/Arithmetic.sol";


/// @title The minipool delegate, should contain all primary logic for methods that minipools use, is entirely upgradable so that currently deployed pools can get any bug fixes or additions - storage here MUST match the minipool contract
/// @author David Rugendyke

contract RocketPoolMiniDelegate is Owned {

    /**** Properties ***********/

    address private rocketNodeAddress;                          // Node this minipool is attached to
    uint256 private stakingDuration;                            // The time this pool will stake for before withdrawal is allowed (seconds)
    uint256 private stakingBalance = 0;                         // The ether balance sent to stake from the pool
    uint256 private stakingBalanceReceived = 0;                 // The ether balance sent to the pool after staking was completed in Casper
    mapping (address => User) private users;                    // Users in this pool
    mapping (address => address) private usersBackupAddress;    // Users backup withdrawal address => users current address in this pool, need these in a mapping so we can do a reverse lookup using the backup address
    address[] private userAddresses;                            // Keep an array of all our user addresses for iteration
    uint256 private status;                                     // The current status of this pool, statuses are declared via Enum in the main hub
    uint256 private statusChangeTime;                           // The timestamp the status changed
    uint256 private depositEtherTradedForTokensTotal;           // The total ether traded for tokens owed by the minipool
    uint8 private version = 1;                                  // The current version of this pool


    /*** Contracts **************/

    RocketStorageInterface rocketStorage = RocketStorageInterface(0);     // The main storage contract where primary persistant storage is maintained  
    RocketSettingsInterface rocketSettings = RocketSettingsInterface(0);  // The main settings contract most global parameters are maintained


    /**** Libs *****************/
    
    using SafeMath for uint;

    
    /*** Structs ***************/

    struct User {
        address userAddress;                                    // Address of the user
        address userAddressBackupWithdrawal;                    // Address of the partner of whom has control of the users address
        address partnerAddress;                                 // Balance deposited
        uint256 balance;                                        // Rewards received after Casper
        int256 rewards;                                         // Rocket Pool deposit tokens withdrawn
        uint256 depositTokensWithdrawn;                         // Rocket Pool fees incured
        uint256 fees;                                           // True if the mapping exists for the user
        bool exists;                                            // When the user was created
        uint created;                                           // Creation timestamp
    }

      
    /*** Events ****************/


    event PoolTransfer (
        address indexed _from,                                  // Transferred from 
        address indexed _to,                                    // Transferred to
        bytes32 indexed _typeOf,                                // Cant have strings indexed due to unknown size, must use a fixed type size and convert string to keccak256
        uint256 value,                                          // Value of the transfer
        uint256 balance,                                        // Balance of the transfer
        uint256 created                                         // Creation timestamp
    );

    event UserAdded (
        address indexed _userAddress,                           // Users address
        uint256 created                                         // Creation timestamp
    );

    event DepositReceived (
        address indexed _userAddress,                           // Users address
        uint256 amount,                                         // Amount of the deposit
        uint256 created                                         // Creation timestamp
    );

    event StatusChange (
        uint256 indexed _statusCodeNew,                         // Pools status code - new
        uint256 indexed _statusCodeOld,                         // Pools status code - old
        uint256 created                                         // Creation timestamp
    );

    event DepositTokenFundSent (
        address indexed _tokenContractAddress,                  // RPD Token Funds Sent
        uint256 amount,                                         // The amount sent
        uint256 created                                         // Creation timestamp
    );
   

    /*** Modifiers *************/

    /// @dev Only registered users with this pool
    /// @param userAddress The users address.
    modifier isPoolUser(address userAddress) {
        assert (userAddress != 0 && users[userAddress].exists != false);
        _;
    }


    /// @dev Only allow access from the latest version of the RocketPool contract
    modifier onlyLatestRocketPool() {
        assert (msg.sender == rocketStorage.getAddress(keccak256("contract.name", "rocketPool")));
        _;
    }

    /// @dev Only allow access from the latest version of the RocketUser contract
    modifier onlyLatestRocketUser() {
        assert (msg.sender == rocketStorage.getAddress(keccak256("contract.name", "rocketUser")));
        _;
    }

    /// @dev Deposits are verified by the main pool, but must also be verified here to meet this pools conditions
    modifier acceptableDeposit {
        // Get the hub contract instance
        rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        // Only allow a users account to be incremented if the pool is in the default status which is PreLaunchAcceptingDeposits
        assert (status == rocketSettings.getPoolDefaultStatus() && msg.value > 0);
        _;
    }

    
    /*** Methods *************/
   
   function RocketPoolMiniDelegate(address _rocketStorageAddress) public {
        // Update the storage address
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
    }


    /// @dev Returns true if this pool is able to send a deposit to Casper
    function getStakingDepositTimeMet() public returns(bool) { 
        // Get the pool count down time
        rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        if (now >= statusChangeTime.add(rocketSettings.getPoolCountdownTime())) {
            return true;
        }
        return false;
    }

    /// @dev Returns true if this pool is able to request withdrawal from Casper
    function getStakingRequestWithdrawalTimeMet() public view returns(bool) {
        if (now >= statusChangeTime.add(stakingDuration)) {
            return true;
        }
        return false;
    }

    /// @dev Returns true if this pool is able to withdraw its deposit + rewards from Casper
    function getStakingWithdrawalTimeMet() public returns(bool) {
        CasperInterface casper = CasperInterface(rocketStorage.getAddress(keccak256("contract.name", "dummyCasper")));
        // Now I'm assuming this method will exist for obvious reasons in Casper, but if it doesn't we can change this to work the same by adding
        // a new setting to RocketSettings that can match the delay required by Casper
        if (now >= casper.getWithdrawalEpoch(this)) {
            return true;
        }
        return false; 
    }



    /*** USERS ***********************************************/

    /// @dev Returns the user count for this pool
    function getUserCount() public view returns(uint256) {
        return userAddresses.length;
    }

    
    /// @dev Rocket Pool updating the users balance, rewards earned and fees occured after staking and rewards are included
    function setUserBalanceRewardsFees(address _userAddress, uint256 _updatedBalance, int256 _updatedRewards, uint256 _updatedFees) public isPoolUser(_userAddress) onlyLatestRocketUser returns(bool) {
        require(status == 4);
        users[_userAddress].balance = _updatedBalance;
        users[_userAddress].rewards = _updatedRewards;
        users[_userAddress].fees = _updatedFees;
        return true;
    }

    /// @dev Set the backup address for the user to collect their deposit + rewards from if the primary address doesn't collect it after a certain time period
    function setUserAddressBackupWithdrawal(address _userAddress, address _userAddressBackupWithdrawalNew) public isPoolUser(_userAddress) onlyLatestRocketUser returns(bool) {
        // This can only be set before staking begins
        require(status == 0 || status == 1);
        usersBackupAddress[_userAddressBackupWithdrawalNew] = _userAddress;
        return true;
    }

    /// @dev Set current users address to the supplied backup one - be careful with this method when calling from the main Rocket Pool contract, all primary logic must be contained there as its upgradable
    function setUserAddressToCurrentBackupWithdrawal(address _userAddress, address _userAddressBackupWithdrawalGiven) public isPoolUser(_userAddress) onlyLatestRocketUser returns(bool) {
        // This can only be called when staking has been completed, do some quick double checks here too
        require(status == 4 && usersBackupAddress[_userAddressBackupWithdrawalGiven] == _userAddress);
        // Copy the mapping struct with the existing users details
        users[_userAddressBackupWithdrawalGiven] = users[_userAddress];
        // Add the user to the array of addresses
        userAddresses.push(_userAddressBackupWithdrawalGiven);
        // Now remove the old user
        removeUser(_userAddress);
        // All good
        return true;
    }


    /// @dev Adds more to the current amount of deposit tokens owed by the user
    function setUserDepositTokensOwedAdd(address _userAddress, uint256 _etherAmount, uint256 _tokenAmount) public isPoolUser(_userAddress) onlyLatestRocketUser returns(bool) {
        // Some basic double checks here, primary logic is in the main Rocket Pool contract
        require(_etherAmount > 0 && _etherAmount <= users[_userAddress].balance);
        // Update their token amount
        users[_userAddress].depositTokensWithdrawn = users[_userAddress].depositTokensWithdrawn.add(_tokenAmount);
        // Update the pool ether total that has been traded for tokens, we know how much to send the token deposit fund based on this
        depositEtherTradedForTokensTotal = depositEtherTradedForTokensTotal.add(_etherAmount);
        // 1 ether = 1 token, deduct from their deposit
        users[_userAddress].balance = users[_userAddress].balance.sub(_etherAmount);
        // Does this user have any balance left? if not, they've withdrawn it all as tokens, remove them from the pool now
        if (users[_userAddress].balance <= 0) {
            removeUser(_userAddress);
        }
        // Sweet
        return true;
    }


    /// @dev Register a new user, only the latest version of the parent pool contract can do this
    /// @param _userAddressToAdd New user address
    /// @param _partnerAddressToAdd The 3rd party partner the user may belong too
    function addUser(address _userAddressToAdd, address _partnerAddressToAdd) public onlyLatestRocketPool returns(bool) {
        // Address exists?
        require(_userAddressToAdd != 0);
        // Check the user isn't already registered
        if (users[_userAddressToAdd].exists == false) {
            // Add the new user to the mapping of User structs
            users[_userAddressToAdd] = User({
                userAddress: _userAddressToAdd,
                userAddressBackupWithdrawal: 0,
                partnerAddress: _partnerAddressToAdd,
                balance: 0,
                rewards: 0,
                depositTokensWithdrawn: 0,
                fees: 0,
                exists: true,
                created: now
            });
            // Store our node address so we can iterate over it if needed
            userAddresses.push(_userAddressToAdd);
            // Fire the event
            UserAdded(_userAddressToAdd, now);
            // Success
            return true;
        }
        return false;
    }


    /// @dev Removes a user from the pool
    /// @param _userAddressToRemove The users address
    function removeUser(address _userAddressToRemove) private returns(bool) {
        // Get the index of the user and remove them from the array of addresses
        uint i = 0;
        bool found = false;
        for (i = 0; i < userAddresses.length; i++) {
            if (userAddresses[i] == _userAddressToRemove) {
                found = true;
                for (uint x = i; x < userAddresses.length-1; x++) {
                    userAddresses[x] = userAddresses[x+1];
                }
                delete userAddresses[userAddresses.length-1];
                userAddresses.length--;
            }
        }
        // Did we find them?
        if (found) {
            // Now remove from our mapping struct
            users[_userAddressToRemove].exists = false;
            users[_userAddressToRemove].userAddress = 0;
            users[_userAddressToRemove].userAddressBackupWithdrawal = 0;
            users[_userAddressToRemove].partnerAddress = 0;
            users[_userAddressToRemove].balance = 0;
            users[_userAddressToRemove].rewards = 0;
            users[_userAddressToRemove].depositTokensWithdrawn = 0;
            users[_userAddressToRemove].fees = 0;
            users[_userAddressToRemove].created = 0;
            // Update the status of the pool if needed
            updateStatus();
            // All good
            return true;
        }
        // Throw to show the delegatecall was not successful
        revert();
    }


    /*** POOL ***********************************************/

    /// @dev Add a users deposit, only the latest version of the parent pool contract can send value here, so once a new version of Rocket Pool is released, existing mini pools can no longer receive deposits
    /// @param _userAddress Users account to accredit the deposit too
    function deposit(address _userAddress) public payable acceptableDeposit isPoolUser(_userAddress) onlyLatestRocketUser returns(bool) {
        // Add to their balance
        users[_userAddress].balance = users[_userAddress].balance.add(msg.value);
        // All good? Fire the event for the new deposit
        PoolTransfer(msg.sender, this, keccak256("deposit"), msg.value, users[_userAddress].balance, now);
        // If all went well
        return true;
    }

    
    /// @dev Allow the user to withdraw their deposit, only possible if the pool is in prelaunch, in countdown to launch or when Casper staking is completed, only the latest main RocketPool contract can make a withdrawal which is where the main checks occur (its upgradable)
    /// @param withdrawAmount amount you want to withdraw
    /// @return The balance remaining for the user
    function withdraw(address userAddress, uint withdrawAmount) public onlyLatestRocketUser returns (bool) {
        // Now check balances are legit
        require(users[userAddress].balance >= withdrawAmount);
        // Deduct the balance right away, before sending to avoid potential recursive calls that allow a user to withdraw an amount greater than their deposit
        users[userAddress].balance = users[userAddress].balance.sub(withdrawAmount);
        // Did it send ok?
        if (!userAddress.send(withdrawAmount)) {
            // Nope, add the amount back to the users account
            users[userAddress].balance = users[userAddress].balance.add(withdrawAmount);
            // Fail
        } else {
            // All good? Fire the event for the withdrawal
            PoolTransfer(this, userAddress, keccak256("withdrawal"), withdrawAmount, users[userAddress].balance, now);
            // Remove this user if they don't have any funds left in this pool
            if (users[userAddress].balance <= 0) {
                // Has this user incurred any fees? I
                if (users[userAddress].fees > 0) {
                    // Get the settings to determine the status
                    rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
                    // Transfer the fee amount now
                    if (rocketSettings.getWithdrawalFeeDepositAddress().send(users[userAddress].fees)) {
                        // All good? Fire the event for the fee transfer
                        PoolTransfer(this, rocketSettings.getWithdrawalFeeDepositAddress(), keccak256("fee"), users[userAddress].fees, users[userAddress].balance, now);
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
        // Throw to show the delegatecall was not successful
        revert();
    }


    /// @dev Closes the pool if the conditions are right
    function canClosePool() private returns(bool) {
        // Can only close pool when not staking or awaiting for stake to be returned from Casper
        if (status != 2 && status != 3) {
            // Set our status now - see RocketSettings.sol for pool statuses and keys
            rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
            // If the pool has no users, it means all users have withdrawn deposits remove this pool and we can exit now
            if (getUserCount() == 0) {
                // Remove the pool from RocketHub via the latest RocketPool contract
                RocketPoolInterface rocketPool = RocketPoolInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketPool")));
                if (rocketPool.removePool()) {
                    // Set the status now just incase self destruct fails for any reason
                    status = 5;
                    // Log any dust remaining from fractions being sent when the pool closes or 
                    // ether left over from a users interest that have withdrawn all their ether as tokens already (thats our fee in this case)
                    PoolTransfer(this, rocketSettings.getWithdrawalFeeDepositAddress(), keccak256("poolClosing"), this.balance, 0, now);
                    // Now self destruct and send any dust left over
                    selfdestruct(rocketSettings.getWithdrawalFeeDepositAddress());
                    // Done
                    return true;
                }
            }
        }
    }

   
    /// @dev Sets the status of the pool based on several parameters 
    function updateStatus() public returns(bool) {
        // Set our status now - see RocketSettings.sol for pool statuses and keys
        rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        // Get Caspers function signatures using our interface
        CasperInterface casper = CasperInterface(rocketStorage.getAddress(keccak256("contract.name", "dummyCasper")));
        // Function returns are stored in memory rather than storage
        uint256 minPoolWeiRequired = rocketSettings.getPoolMinEtherRequired();
        uint256 statusOld = status;
        // Check to see if we can close the pool
        if (canClosePool()) {
            return true;
        }
        // Set to awaiting status and deposits if a user has withdrawn their deposit while in countdown and the min required wei for launch is now lower than required
        if (this.balance < minPoolWeiRequired && status == 1) {
            status = 0;
        }
        // Set to countdown for staking, no longer accepting deposits but users can withdraw during this time if they change their mind
        if (this.balance >= minPoolWeiRequired && status == 0) {
            status = 1;
        }
        // If all the parameters for staking are ok and a rocketNodeAddress has been set by the node checkin, we are now ready for staking
        if (this.balance >= minPoolWeiRequired && status == 1 && rocketNodeAddress != 0 && stakingBalance == 0 && getStakingDepositTimeMet() == true) { 
            // Set our current staking balance
            stakingBalance = this.balance;
            // Send our mini pools balance to casper now with our assigned nodes details
            // TODO: rocketNodeValidationCode is currently spec'd as 'bytes' in the Mauve paper, this is a variable length type that cannot be passed from contract to contract at the moment
            // This prevents the below working currently, so rocketNodeValidationCode has been changed to 'bytes32' for now until they get around to implementing passing variable memory types ( https://github.com/ethereum/EIPs/pull/211 )
            // If for some reason this isn't implemented by the time Casper is ready, we can simply send the deposit to the mini pools assigned node who can act as an oracle then send the bytes code along with the Ether directly from the node via the nodejs service script            
            if (casper.deposit.value(this.balance).gas(400000)(this)) {
                // Set the mini pool status as staking
                status = 2;
                // All good? Fire the event for the new casper transfer
                PoolTransfer(this, rocketStorage.getAddress(keccak256("contract.name", "dummyCasper")), keccak256("casperDeposit"), stakingBalance, 0, now); 
            } else {
                stakingBalance = 0;
            }        
        }
        // Are we all set to request withdrawal of our deposit from Casper?
        if (stakingBalance > 0 && status == 2 && getStakingRequestWithdrawalTimeMet() == true) { 
            // Request withdrawal now
            if (casper.startWithdrawal()) {
                // Set the mini pool status as having requested withdrawal
                status = 3;
            }
        }
        // Are we all set to actually withdraw our deposit + rewards from Casper?
        if (stakingBalance > 0 && status == 3 && getStakingWithdrawalTimeMet() == true) {
            // Request withdrawal now
            if (casper.withdraw(false)) {
                // Set the mini pool status as having completed withdrawal, users can now withdraw
                status = 4;
                // Do a few landing checks now
                // See if any ether in the pool has been traded for tokens
                if (depositEtherTradedForTokensTotal > 0) {
                    // Ok, since 1 ether = 1 token, send the balance of these outstanding  ethers to the deposit token contract so users can trade tokens for them later
                    // Sender should be the node that triggered this
                    address depositTokenContract = rocketStorage.getAddress(keccak256("contract.name", "rocketDepositToken"));
                    if (depositTokenContract.call.value(depositEtherTradedForTokensTotal)()) {
                        // Fire the event
                        DepositTokenFundSent(depositTokenContract, depositEtherTradedForTokensTotal, now);
                        // If all users in this pool have withdrawn their deposits as tokens, then we won't have any users in here to withdraw ether, see if we can close
                        canClosePool();
                    }
                }
            }
        }
        // Fire the event if the status has changed
        if (status != statusOld) {
            statusChangeTime = now;
            StatusChange(status, statusOld, now);
        } 
    }
    
}
