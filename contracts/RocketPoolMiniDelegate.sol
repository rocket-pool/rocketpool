pragma solidity 0.4.19;


import "./RocketBase.sol";
import "./RocketDepositToken.sol"; 
import "./interface/RocketStorageInterface.sol";
import "./interface/RocketSettingsInterface.sol";
import "./interface/RocketPoolInterface.sol";
import "./interface/CasperInterface.sol";
import "./lib/SafeMath.sol";


/// @title The minipool delegate, should contain all primary logic for methods that minipools use, is entirely upgradable so that currently deployed pools can get any bug fixes or additions - storage here MUST match the minipool contract
/// @author David Rugendyke
contract RocketPoolMiniDelegate is RocketBase {

    /**** Properties ***********/

    address private nodeOwner;                                  // Node this minipool is attached to
    address private nodeValCodeAddress;                         // Nodes validation code address
    uint256 private stakingDuration;                            // The time this pool will stake for before withdrawal is allowed (seconds)
    uint256 private stakingBalance = 0;                         // The ether balance sent to stake from the pool
    uint256 private stakingBalanceReceived = 0;                 // The ether balance sent to the pool after staking was completed in Casper
    mapping (address => User) private users;                    // Users in this pool
    mapping (address => address) private usersBackupAddress;    // Users backup withdrawal address => users current address in this pool, need these in a mapping so we can do a reverse lookup using the backup address
    address[] private userAddresses;                            // Keep an array of all our user addresses for iteration
    uint256 private status;                                     // The current status of this pool, statuses are declared via Enum in the main hub
    uint256 private statusChangeTime;                           // The timestamp the status changed
    uint256 private depositEtherTradedForTokensTotal;           // The total ether traded for tokens owed by the minipool


    /*** Contracts **************/

    CasperInterface casper = CasperInterface(0);                            // The address of the Casper contract
    RocketSettingsInterface rocketSettings = RocketSettingsInterface(0);    // The main settings contract most global parameters are maintained
    

    /**** Libs *****************/
    
    using SafeMath for uint;

    
    /*** Structs ***************/

    struct User {
        address userAddress;                                    // Address of the user
        address userAddressBackupWithdrawal;                    // Users widow address
        address partnerAddress;                                 // Address of the partner of whom has control of the users address
        uint256 balance;                                        // Balance deposited
        int256 rewards;                                         // Rewards received after Casper
        uint256 depositTokensWithdrawn;                         // Rocket Pool deposit tokens withdrawn
        uint256 fees;                                           // Rocket Pool fees incured
        bool exists;                                            // User exists?
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
        address indexed _fromAddress,                           // From address
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

    event VoteCast (
        uint256 epoch,
        bytes voteMessage
    );
  

    /*** Modifiers *************/

    /// @dev Only registered users with this pool
    /// @param userAddress The users address.
    modifier isPoolUser(address userAddress) {
        require(userAddress != 0 && users[userAddress].exists != false);
        _;
    }

    /// @dev Only allow access from the latest version of the RocketPool contract
    modifier onlyLatestRocketPool() {
        require(msg.sender == rocketStorage.getAddress(keccak256("contract.name", "rocketPool")));
        _;
    }

    /// @dev Only allow access from the latest version of the RocketUser contract
    modifier onlyLatestRocketUser() {
        require(msg.sender == rocketStorage.getAddress(keccak256("contract.name", "rocketUser")));
        _;
    }

    /// @dev Deposits are verified by the main pool, but must also be verified here to meet this pools conditions
    modifier acceptableDeposit {
        // Get the hub contract instance
        rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        // Only allow a users account to be incremented if the pool is in the default status which is PreLaunchAcceptingDeposits
        require(status == rocketSettings.getMiniPoolDefaultStatus() && msg.value > 0);
        _;
    }
    
    
    /*** Methods *************/
   
    function RocketPoolMiniDelegate(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // The current version of this pool
        version = 1; 
    }

    /// @dev Returns the current validator index in Casper of this minipool
    function getCasperValidatorIndex() public view returns(uint128) {
        return casper.get_validator_indexes(address(this));
    }

    /// @dev Returns true if this pool is able to send a deposit to Casper
    function getCanDeposit() public returns(bool) { 
        // Get the pool count down time
        rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        if (now >= statusChangeTime.add(rocketSettings.getMiniPoolCountDownTime())) {
            return true;
        }
        return false;
    }

    /// @dev Returns true if this pool is able to request logging out of the validator set from Casper
    function getCanLogout() public view returns(bool) {
        // Check if our staking time has passed first
        if (now >= statusChangeTime.add(stakingDuration)) {
            // Now check to see if we meet the Casper requirements for logging out before attempting
            // We must not have already logged out
            if (casper.get_validators__dynasty_end(getCasperValidatorIndex()) > casper.get_dynasty() + casper.get_dynasty_logout_delay()) {
                // Ok to logout
                return true;
            }
        }
        return false;
    }

    /// @dev Returns true if this pool is able to withdraw its deposit + rewards from Casper
    function getCanWithdraw() public view returns(bool) {
        // These rules below must match the ones Casper has for withdrawing
        // Verify the dynasty is correct for withdrawing 
        if (casper.get_dynasty() >= casper.get_validators__dynasty_end(getCasperValidatorIndex()) + 1) {
            // Verify the end epoch is correct for withdrawing
            uint128 endEpoch = casper.get_dynasty_start_epoch(casper.get_validators__dynasty_end(getCasperValidatorIndex()) + 1);
            return casper.get_current_epoch() >= endEpoch + casper.get_withdrawal_delay() ? true : false;
        }
        return false;
    }

    /// @dev Returns true if this pool is able to allow withdrawals after staking is completed
    function getCanUsersWithdraw() public returns(bool) {
        // Verify the delay has passed and the deposit has been received
        rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        // Check the status is correct, the contract has a balance and Casper shows the validator as deleted (means its processed the withdrawal)
        return status == 4 && this.balance > 0 && stakingBalanceReceived > 0 && casper.get_deposit_size(getCasperValidatorIndex()) == 0 ? true : false;
    }

    /// @dev Returns true if this pool is able to cast votes with Casper
    function getCanVote() public returns(bool) {
        bool isStakingOrAwaitingLogout = (status == 2 || status == 3);
        bool isAssignedToNode = nodeOwner != 0;
        bool hasSignatureVerificationContractBeenDeployed = nodeValCodeAddress != 0;
        bool hasDepositBeenSentToCasper = this.balance == 0;

        // retrieve the vote bitmap for the current epoch
        // votes are stored as a bitmap to save on storage
        // each bit is a boolean value representing whether a particular validator (at index number) has voted or not
        uint256 voteBitmap = casper.votes__vote_bitmap(casper.get_current_epoch(), getCasperValidatorIndex()); 
        // create a bit mask to retrieve the has-voted value for our validator index
        // e.g 000000000100000000000 
        uint256 bitMask = 0x1 * uint256(2) ** (getCasperValidatorIndex() % 256);
        // the bitwise & operator will effectively return the bitmask if we have already voted or all zeros if we haven't        
        bool hasAlreadyVoted = (voteBitmap & bitMask) > 0;

        // TODO: need !inFirstQuarterOfEpoch check - to be done when integrated real casper and block increment functionality
        // bool inFirstQuarterOfEpoch = (block.number % casper.get_epoch_length()) <= (casper.get_epoch_length() / 4);

        return 
            isStakingOrAwaitingLogout && 
            isAssignedToNode &&
            hasSignatureVerificationContractBeenDeployed &&
            hasDepositBeenSentToCasper &&
            !hasAlreadyVoted &&
            isLoggedIntoCasper(getCasperValidatorIndex());
    }

    /// @dev Returns true if the validator is logged into Casper
    /// @param _validatorIndex Index of validator in Casper
    function isLoggedIntoCasper(uint128 _validatorIndex) private view returns(bool) {
        uint128 startDynasty = casper.get_validators__dynasty_start(_validatorIndex);
        uint128 endDynasty = casper.get_validators__dynasty_end(_validatorIndex);
        uint128 currentDynasty = casper.get_dynasty();

        uint128 pastDynasty = currentDynasty - 1;
        bool inCurrentDynasty = ((startDynasty <= currentDynasty) && (currentDynasty < endDynasty));
        bool inPrevDynasty = ((startDynasty <= pastDynasty) && (pastDynasty < endDynasty));
        if (!(inCurrentDynasty || inPrevDynasty))
            return false;
        return true;
    }    

    /*** USERS ***********************************************/

    /// @dev Returns the user count for this pool
    function getUserCount() public view returns(uint256) {
        return userAddresses.length;
    }
    
    /// @dev Rocket Pool updating the users balance, rewards earned and fees occured after staking and rewards are included
    function setUserBalanceRewardsFees(address _userAddress, uint256 _updatedBalance, int256 _updatedRewards, uint256 _updatedFees) external isPoolUser(_userAddress) onlyLatestRocketUser returns(bool) {
        require(status == 4);
        users[_userAddress].balance = _updatedBalance;
        users[_userAddress].rewards = _updatedRewards;
        users[_userAddress].fees = _updatedFees;
        return true;
    }

    /// @dev Set the backup address for the user to collect their deposit + rewards from if the primary address doesn't collect it after a certain time period
    function setUserAddressBackupWithdrawal(address _userAddress, address _userAddressBackupWithdrawalNew) external isPoolUser(_userAddress) onlyLatestRocketUser returns(bool) {
        // This can only be set before staking begins
        require(status == 0 || status == 1);
        usersBackupAddress[_userAddressBackupWithdrawalNew] = _userAddress;
        return true;
    }

    /// @dev Set current users address to the supplied backup one - be careful with this method when calling from the main Rocket Pool contract, all primary logic must be contained there as its upgradable
    function setUserAddressToCurrentBackupWithdrawal(address _userAddress, address _userAddressBackupWithdrawalGiven) external isPoolUser(_userAddress) onlyLatestRocketUser returns(bool) {
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
    function setUserDepositTokensOwedAdd(address _userAddress, uint256 _etherAmount, uint256 _tokenAmount) external isPoolUser(_userAddress) onlyLatestRocketUser returns(bool) {
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
    function addUser(address _userAddressToAdd, address _partnerAddressToAdd) external onlyLatestRocketPool returns(bool) {
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
                if (i < userAddresses.length-1) {
                    userAddresses[i] = userAddresses[userAddresses.length-1];
                }
                delete userAddresses[userAddresses.length-1];
                userAddresses.length--;
            }
        }
        // Check that user was found
        require(found);
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
    

    /*** POOL ***********************************************/

    /// @dev Add a users deposit, only the latest version of the parent pool contract can send value here, so once a new version of Rocket Pool is released, existing mini pools can no longer receive deposits
    /// @param _userAddress Users account to accredit the deposit too
    function deposit(address _userAddress) external payable acceptableDeposit isPoolUser(_userAddress) onlyLatestRocketUser returns(bool) {
        // Add to their balance
        users[_userAddress].balance = users[_userAddress].balance.add(msg.value);
        // All good? Fire the event for the new deposit
        PoolTransfer(msg.sender, this, keccak256("deposit"), msg.value, users[_userAddress].balance, now);
        // If all went well
        return true;
    }
    
    /// @dev Allow the user to withdraw their deposit, only possible if the pool is in prelaunch, in countdown to launch or when Casper staking is completed, only the latest main RocketUser contract can make a withdrawal which is where the main checks occur
    /// @param withdrawAmount amount you want to withdraw
    /// @return The balance remaining for the user
    function withdraw(address userAddress, uint withdrawAmount) external onlyLatestRocketUser returns (bool) {
        // Check that the user has a sufficient balance and is withdrawing a positive amount
        require(users[userAddress].balance >= withdrawAmount && withdrawAmount > 0);
        // Deduct the withdrawal amount from the user's balance
        users[userAddress].balance = users[userAddress].balance.sub(withdrawAmount);
        // Remove this user if they don't have any funds left in this pool
        if (users[userAddress].balance <= 0) {
            // Has this user incurred any fees?
            if (users[userAddress].fees > 0) {
                // Get the settings to determine the status
                rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
                // Transfer the fee amount now 
                rocketSettings.getMiniPoolWithdrawalFeeDepositAddress().transfer(users[userAddress].fees);
                // Fire the event for the fee transfer
                PoolTransfer(this, rocketSettings.getMiniPoolWithdrawalFeeDepositAddress(), keccak256("fee"), users[userAddress].fees, users[userAddress].balance, now);
            }
            // Remove the user from the pool now they dont have a balance
            removeUser(userAddress);
        }
        // Update the status of the pool
        updateStatus();
        // Send withdrawal amount to user's address
        userAddress.transfer(withdrawAmount);
        // Fire the event for the withdrawal
        PoolTransfer(this, userAddress, keccak256("withdrawal"), withdrawAmount, users[userAddress].balance, now);
        // Success
        return true;
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
                    PoolTransfer(this, rocketSettings.getMiniPoolWithdrawalFeeDepositAddress(), keccak256("poolClosing"), this.balance, 0, now);
                    // Now self destruct and send any dust left over
                    selfdestruct(rocketSettings.getMiniPoolWithdrawalFeeDepositAddress());
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
        // Function returns are stored in memory rather than storage
        uint256 minPoolWeiRequired = rocketSettings.getMiniPoolLaunchAmount();
        // Check to see if we can close the pool
        if (canClosePool()) {
            return true;
        }
        // If there are no users in the pool, then all users have withdrawn before the minipool launched for staking, reset it all
        if (getUserCount() == 0 && status <= 1) {
            // No users, reset the status to awaiting deposits
            changeStatus(0);
            // Done
            return;
        }
        // The pool now has user(s), has been assigned a staking duration but the balance has not reached enough to begin staking yet
        if (getUserCount() > 0 && stakingDuration > 0 && this.balance < minPoolWeiRequired && status == 0) {
            // Update status
            changeStatus(0);
            // Done
            return;
        }
        // Set to countdown for staking, no longer accepting deposits but users can withdraw during this time if they change their mind
        if (getUserCount() > 0 && stakingDuration > 0 && this.balance >= minPoolWeiRequired && status == 0) {
            // Update status
            changeStatus(1);
            // Done
            return;
        }
        // If all the parameters for staking are ok and a nodeOwner has been set by the node checkin, we are now ready for staking
        if (getUserCount() > 0 && stakingDuration > 0 && this.balance >= minPoolWeiRequired && status == 1 && nodeOwner != 0 && nodeValCodeAddress != 0 && stakingBalance == 0 && getCanDeposit() == true) { 
            // Set our current staking balance
            stakingBalance = this.balance;
            // Send our mini pools balance to casper now with our assigned nodes details, will throw if Caspers min deposit is not met
            // We're also sending our minipool address as the Validation Address for Casper which it needs to identify this validator
            casper.deposit.value(this.balance).gas(rocketSettings.getMiniPoolDepositGas())(nodeValCodeAddress, address(this));
            // All good? Fire the event for the new casper transfer
            PoolTransfer(this, rocketStorage.getAddress(keccak256("contract.name", "casper")), keccak256("casperDeposit"), stakingBalance, 0, now);    
            // Set the mini pool status as staking
            changeStatus(2);
            // Done
            return;   
        }       
        // Are we all set to actually withdraw our deposit + rewards from Casper?
        if (stakingBalance > 0 && status == 3 && getCanWithdraw() == true) {
            // Request withdrawal now 
            casper.withdraw(getCasperValidatorIndex());
            // Set the mini pool status as having completed withdrawal, users can now withdraw
            changeStatus(4);
            // Record the current balance as the deposit received via an internal transaction when withdraw was executed above
            stakingBalanceReceived = address(this).balance;
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
            // Done
            return; 
        }
        
    }

    /// @dev Cast Casper votes 
    /// @param _epoch The epoch number voting relates to
    /// @param _voteMessage Vote message to be sent to Casper
    function vote(uint256 _epoch, bytes _voteMessage) public returns(bool) {
        // Make sure we should be voting
        require(getCanVote() == true);
        // Cast vote with Casper
        casper.vote(_voteMessage);
        // Emit event to notify
        VoteCast(_epoch, _voteMessage);
        return true;
    }

    /// @dev Logout from Casper and wait for withdrawal
    /// @param _logoutMessage The constructed logout message from the node containing RLP encoded: [validator_index, epoch, node signature]
    function logout(bytes _logoutMessage) public returns(bool) {
        // check to make sure we can logout
        require(stakingBalance > 0 && status == 2 && getCanLogout() == true);
        // Request logout now, will throw if conditions not met
        casper.logout(_logoutMessage);
        // Set the mini pool status as having requested logout
        changeStatus(3);
        return true;
    }

    /// @dev Change the status
    /// @param _newStatus status id to apply to the minipool
    function changeStatus(uint256 _newStatus) private {
        // Fire the event if the status has changed
        if (_newStatus != status) {
            status = _newStatus;
            statusChangeTime = now;
            StatusChange(_newStatus, status, now);
        } 
    }
}
