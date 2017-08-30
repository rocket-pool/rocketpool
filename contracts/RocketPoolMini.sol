pragma solidity ^0.4.11;

import "./RocketHub.sol";
import "./interface/RocketSettingsInterface.sol";
import "./interface/RocketPoolInterface.sol";
import "./interface/CasperInterface.sol";
import "./contract/Owned.sol";


/// @title A minipool under the main RocketPool, all major logic is contained within the RocketPoolMiniDelegate contract which is upgradable when minipools are deployed
/// @author David Rugendyke

contract RocketPoolMini is Owned {

    /**** Properties ***********/

    // Hub address
    address private rocketHubAddress;                           // Node this minipool is attached to
    address private rocketNodeAddress;                          // Node validation code for Casper
    bytes32 private rocketNodeValidationCode;                   // Node randao for Casper
    bytes32 private rocketNodeRandao;                           // The time this pool will stake for before withdrawal is allowed (seconds)
    uint256 private stakingDuration;                            // The ether balance sent to stake from the pool
    uint256 private stakingBalance = 0;                         // The ether balance sent to the pool after staking was completed in Casper
    uint256 private stakingBalanceReceived = 0;                 // Users in this pool
    mapping (address => User) private users;                    // Users backup withdrawal address => users current address in this pool, need these in a mapping so we can do a reverse lookup using the backup address
    mapping (address => address) private usersBackupAddress;    // Keep an array of all our user addresses for iteration
    address[] private userAddresses;                            // The current status of this pool, statuses are declared via Enum in the main hub
    uint256 private status;                                     // The timestamp the status changed
    uint256 private statusChangeTime;                           // The total ether traded for tokens owed by the minipool
    uint256 private depositEtherTradedForTokensTotal;           // The current version of this pool
    uint8 private version = 1;                                  // Current version of this minipool


    /*** Contracts **************/

    RocketHub rocketHub = RocketHub(0);                         // The main RocketHub contract where primary persistant storage is maintained

    
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

    event PoolCreated (
        address indexed _address,                               // Address of the pool
        uint256 created                                         // Creation timestamp
    );

    event PoolTransfer (
        address indexed _from,                                  // Transferred from 
        address indexed _to,                                    // Transferred to
        bytes32 indexed _typeOf,                                // Cant have strings indexed due to unknown size, must use a fixed type size and convert string to sha3
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

    /// @dev Deposits are verified by the main pool, but must also be verified here to meet this pools conditions
    modifier acceptableDeposit {
        // Get the hub contract instance
        RocketSettingsInterface rocketSettings = RocketSettingsInterface(rocketHub.getRocketSettingsAddress());
        // Only allow a users account to be incremented if the pool is in the default status which is PreLaunchAcceptingDeposits
        assert (status == rocketSettings.getPoolDefaultStatus() && msg.value > 0);
        _;
    }

    /// @dev Only allow access from the latest version of the RocketPool contract
    modifier onlyLatestRocketPool() {
        assert (msg.sender == rocketHub.getRocketPoolAddress());
        _;
    }

    
    /*** Methods *************/
   
    /// @dev pool constructor
    function RocketPoolMini(address deployedRocketHubAddress, uint256 miniPoolStakingDuration) {
        // Set the address of the main hub
        rocketHubAddress = deployedRocketHubAddress;
        // Update the contract address
        rocketHub = RocketHub(deployedRocketHubAddress);
        // Staking details
        stakingDuration = miniPoolStakingDuration;
        // The pool isn't initally assigned to a node, only later when launching
        rocketNodeAddress = 0;
        // New pools are set to pre launch and accept deposits by default
        RocketSettingsInterface rocketSettings = RocketSettingsInterface(rocketHub.getRocketSettingsAddress());
        status = rocketSettings.getPoolDefaultStatus();
        statusChangeTime = 0;
        // The total ether traded for tokens owed by the minipool
        depositEtherTradedForTokensTotal = 0;
    }

    /// @dev Fallback function where our deposit + rewards will be received after requesting withdrawal from Casper
    function() public payable { 
        // Only Casper can transfer value to a pool
        assert (msg.sender == rocketHub.getCasperAddress());
        // Set the staking balance we've received
        stakingBalanceReceived = msg.value;
        // Log the deposit attempt received
        PoolTransfer(msg.sender, this, sha3("casperDepositReturn"), msg.value, this.balance, now);       
    }


    /// @dev Returns the status of this pool
    function getStatus() public constant returns(uint) {
        return status;
    }

    /// @dev Returns the time the status last changed to its current status
    function getStatusChangeTime() public constant returns(uint256) {
        return statusChangeTime;
    }

    /// @dev Gets the current Ether amount sent for staking
    function getStakingBalance() public constant returns(uint256) {
        return stakingBalance;
    }

    /// @dev Gets the current Ether amount sent for staking
    function getStakingBalanceReceived() public constant returns(uint256) {
        return stakingBalanceReceived;
    }

    /// @dev Gets the current staking duration
    function getStakingDuration() public constant returns(uint256) {
        return stakingDuration;
    }
 
    /// @dev Gets the node address this mini pool is attached too
    function getNodeAddress() public constant returns(address) {
        return rocketNodeAddress;
    }

    /// @dev Returns true if this pool is able to send a deposit to Casper
    function getStakingDepositTimeMet() public constant returns(bool) {
        if (RocketHub(rocketHubAddress).getRocketPoolMiniDelegateAddress().delegatecall(bytes4(sha3("getStakingDepositTimeMet()")))) {
            return true;
        }
        return false;
    }

    /// @dev Returns true if this pool is able to request withdrawal from Casper
    function getStakingRequestWithdrawalTimeMet() public constant returns(bool) {
        if (RocketHub(rocketHubAddress).getRocketPoolMiniDelegateAddress().delegatecall(bytes4(sha3("getStakingRequestWithdrawalTimeMet()")))) {
            return true;
        }
        return false;
    }

    /// @dev Returns true if this pool is able to withdraw its deposit + rewards from Casper
    function getStakingWithdrawalTimeMet() public constant returns(bool) {
        if (RocketHub(rocketHubAddress).getRocketPoolMiniDelegateAddress().delegatecall(bytes4(sha3("getStakingWithdrawalTimeMet()")))) {
            return true;
        }
        return false;
    }

    /// @dev Set the node address this mini pool is attached too
    function setNodeDetails(address nodeAddress, bytes32 nodeValidationCode, bytes32 nodeRandao) public onlyLatestRocketPool {
        rocketNodeAddress = nodeAddress;
        rocketNodeValidationCode = nodeValidationCode;
        rocketNodeRandao = nodeRandao;
    }

    /// @dev Gets the current staking duration
    function setStakingDuration(uint256 newStakingDuration) public onlyLatestRocketPool {
        stakingDuration = newStakingDuration;
    }   


    /*** USERS ***********************************************/

    /// @dev Returns the user count for this pool
    function getUserCount() public constant returns(uint256) {
        return userAddresses.length;
    }

    /// @dev Returns the true if the user is in this pool
    function getUserExists(address userAddress) public constant returns(bool) {
        return users[userAddress].exists;
    }

    /// @dev Returns the users original address specified for withdrawals
    function getUserAddressFromBackupAddress(address userBackupAddress) public constant returns(address) {
        return usersBackupAddress[userBackupAddress];
    }

    /// @dev Returns the true if the user has a backup address specified for withdrawals
    function getUserBackupAddressExists(address userBackupAddress) public constant returns(bool) {
        return usersBackupAddress[userBackupAddress] != 0 ? true : false;
    }

    /// @dev Returns the true if the user has a backup address specified for withdrawals and that maps correctly to their original user address
    function getUserBackupAddressOK(address userAddress, address userBackupAddress) public constant isPoolUser(userAddress) returns(bool) {
        return usersBackupAddress[userBackupAddress] == userAddress ? true : false;
    }

    /// @dev Returns the true if the user has a deposit in this mini pool
    function getUserHasDeposit(address userAddress) public constant returns(bool) {
        return users[userAddress].exists && users[userAddress].balance > 0 ? true : false;
    }

    /// @dev Returns the amount of the users deposit
    function getUserDeposit(address userAddress) public constant isPoolUser(userAddress) returns(uint256) {
        return users[userAddress].balance;
    }

    /// @dev Returns the amount of the deposit tokens the user has taken out
    function getUserDepositTokensWithdrawn(address userAddress) public constant isPoolUser(userAddress) returns(uint256) {
        return users[userAddress].depositTokensWithdrawn;
    }

    /// @dev Returns the main user properties
    function getUser(address userAddress) public constant isPoolUser(userAddress) returns(address, uint256, uint256) {
        return (users[userAddress].partnerAddress, 
                users[userAddress].balance,
                users[userAddress].created
        );
    }

    /// @dev Returns the users partner address
    function getUserPartner(address userAddress) public constant isPoolUser(userAddress) returns(address) {
        return users[userAddress].partnerAddress;
    }

    /// @dev Rocket Pool updating the users balance, rewards earned and fees occured after staking and rewards are included
    function setUserBalanceRewardsFees(address userAddress, uint256 updatedBalance, int256 updatedRewards, uint256 updatedFees) public isPoolUser(userAddress) onlyLatestRocketPool returns(bool) {
        if (RocketHub(rocketHubAddress).getRocketPoolMiniDelegateAddress().delegatecall(bytes4(sha3("setUserBalanceRewardsFees(address,uint256,int256,uint256)")), userAddress, updatedBalance, updatedRewards, updatedFees)) {
            return true;
        }
        return false;
    }

    /// @dev Set the backup address for the user to collect their deposit + rewards from if the primary address doesn't collect it after a certain time period
    function setUserAddressBackupWithdrawal(address userAddress, address userAddressBackupWithdrawalNew) public isPoolUser(userAddress) onlyLatestRocketPool returns(bool) {
        assert (RocketHub(rocketHubAddress).getRocketPoolMiniDelegateAddress().delegatecall(bytes4(sha3("setUserAddressBackupWithdrawal(address,address)")), userAddress, userAddressBackupWithdrawalNew) == true);
    }

    /// @dev Set current users address to the supplied backup one - be careful with this method when calling from the main Rocket Pool contract, all primary logic must be contained there as its upgradable
    function setUserAddressToCurrentBackupWithdrawal(address userAddress, address userAddressBackupWithdrawalGiven) public isPoolUser(userAddress) onlyLatestRocketPool returns(bool) {
        if (RocketHub(rocketHubAddress).getRocketPoolMiniDelegateAddress().delegatecall(bytes4(sha3("setUserAddressToCurrentBackupWithdrawal(address,address)")), userAddress, userAddressBackupWithdrawalGiven)) {
            return true;
        }
        return false;
    }

    /// @dev Adds more to the current amount of deposit tokens owed by the user
    function setUserDepositTokensOwedAdd(address userAddress, uint256 etherAmount, uint256 tokenAmount) public isPoolUser(userAddress) onlyLatestRocketPool returns(bool) {
        if (RocketHub(rocketHubAddress).getRocketPoolMiniDelegateAddress().delegatecall(bytes4(sha3("setUserDepositTokensOwedAdd(address,uint256,uint256)")), userAddress, etherAmount, tokenAmount)) {
            return true;
        }
        return false;
    }

    /// @dev Register a new user, only the latest version of the parent pool contract can do this
    /// @param userAddressToAdd New user address
    /// @param partnerAddressToAdd The 3rd party partner the user may belong too
    function addUser(address userAddressToAdd, address partnerAddressToAdd) public onlyLatestRocketPool returns(bool) {
        if (RocketHub(rocketHubAddress).getRocketPoolMiniDelegateAddress().delegatecall(bytes4(sha3("addUser(address,address)")), userAddressToAdd, partnerAddressToAdd)) {
            return true;
        }
        return false;
    }



    /*** POOL ***********************************************/

    /// @dev Add a users deposit, only the latest version of the parent pool contract can send value here, so once a new version of Rocket Pool is released, existing mini pools can no longer receive deposits
    /// @param userAddress Users account to accredit the deposit too
    function addDeposit(address userAddress) public payable acceptableDeposit isPoolUser(userAddress) onlyLatestRocketPool returns(bool) {
        // Add to their balance
        users[userAddress].balance += msg.value;
        // All good? Fire the event for the new deposit
        PoolTransfer(msg.sender, this, sha3("deposit"), msg.value, users[userAddress].balance, now);
        // If all went well
        return true;
    }

    /// @dev Allow the user to withdraw their deposit, only possible if the pool is in prelaunch, in countdown to launch or when Casper staking is completed, only the latest main RocketPool contract can make a withdrawal which is where the main checks occur (its upgradable)
    /// @param withdrawAmount amount you want to withdraw
    /// @return The balance remaining for the user
    function withdraw(address userAddress, uint256 withdrawAmount) public onlyLatestRocketPool returns (bool) {
        if (RocketHub(rocketHubAddress).getRocketPoolMiniDelegateAddress().delegatecall(bytes4(sha3("withdraw(address,uint256)")), userAddress, withdrawAmount)) {
            return true;
        }
        return false;
    }

    /// @dev Sets the status of the pool based on several parameters 
    function updateStatus() public returns(bool) {
        if (RocketHub(rocketHubAddress).getRocketPoolMiniDelegateAddress().delegatecall(bytes4(sha3("updateStatus()")))) {
            return true;
        }
        return false;
    }
    

}
