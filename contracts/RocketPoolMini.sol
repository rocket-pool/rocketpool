pragma solidity 0.4.18;


import "./contract/Ownable.sol";
import "./interface/RocketStorageInterface.sol";
import "./interface/RocketSettingsInterface.sol";
import "./interface/CasperInterface.sol";


/// @title A minipool under the main RocketPool, all major logic is contained within the RocketPoolMiniDelegate contract which is upgradable when minipools are deployed
/// @author David Rugendyke
contract RocketPoolMini is Ownable {

    /**** Properties ***********/

    address private rocketNodeAddress = 0;                      // Node this minipool is attached to, this is set just before it launches
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
    /// @param _userAddress The users address.
    modifier isPoolUser(address _userAddress) {
        require(_userAddress != 0 && users[_userAddress].exists != false);
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


    
    /*** Methods *************/
   
    /// @dev pool constructor
    function RocketPoolMini(address _rocketStorageAddress, uint256 _miniPoolStakingDuration) public {
        // Update the storage address
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
        // Staking details
        stakingDuration = _miniPoolStakingDuration;
        // New pools are set to pre launch and accept deposits by default
        rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        status = rocketSettings.getMiniPoolDefaultStatus();
        statusChangeTime = 0;
        // The total ether traded for tokens owed by the minipool
        depositEtherTradedForTokensTotal = 0;
    }
    
    /// @dev Fallback function where our deposit + rewards will be received after requesting withdrawal from Casper
    function() public payable { 
        // Only Casper can transfer value to a pool
        require(msg.sender == rocketStorage.getAddress(keccak256("contract.name", "casper")));
        // Set the staking balance we've received
        stakingBalanceReceived = msg.value;
        // Log the deposit attempt received
        PoolTransfer(msg.sender, this, keccak256("casperDepositReturn"), msg.value, this.balance, now);       
    }

    /// @dev Use inline assembly to read the boolean value back from a delegatecall method in the minipooldelegate contract
    function getMiniDelegateBooleanResponse(bytes4 _signature) public returns (bool) {
        address minipoolDelegateAddress = rocketStorage.getAddress(keccak256("contract.name", "rocketPoolMiniDelegate"));
        bool response = false;
        assembly {
            let returnSize := 32
            let mem := mload(0x40)
            mstore(mem, _signature)
            let err := delegatecall(sub(gas, 10000), minipoolDelegateAddress, mem, 0x44, mem, returnSize)
            response := mload(mem)
            mstore(0x40, add(mem,0x44))
        }
        return response; 
    }

    /// @dev Returns the status of this pool
    function getStatus() public view returns(uint) {
        return status;
    }

    /// @dev Returns the time the status last changed to its current status
    function getStatusChangeTime() public view returns(uint256) {
        return statusChangeTime;
    }

    /// @dev Gets the current Ether amount sent for staking
    function getStakingBalance() public view returns(uint256) {
        return stakingBalance;
    }

    /// @dev Gets the current Ether amount sent for staking
    function getStakingBalanceReceived() public view returns(uint256) {
        return stakingBalanceReceived;
    }

    /// @dev Gets the current staking duration
    function getStakingDuration() public view returns(uint256) {
        return stakingDuration;
    }
 
    /// @dev Gets the node address this mini pool is attached too
    function getNodeAddress() public view returns(address) {
        return rocketNodeAddress;
    }

    /// @dev Returns true if this pool is able to send a deposit to Casper   
    function getCanDeposit() public returns (bool) {
        return getMiniDelegateBooleanResponse(bytes4(keccak256("getCanDeposit()")));
    }

    /// @dev Returns true if this pool is able to request logging out of the validator set from Casper
    function getCanLogout() public returns(bool) {
        return getMiniDelegateBooleanResponse(bytes4(keccak256("getCanLogout()")));
    }

    /// @dev Returns true if this pool is able to withdraw its deposit + rewards from Casper
    function getCanWithdraw() public returns(bool) {
        return getMiniDelegateBooleanResponse(bytes4(keccak256("getCanWithdraw()")));
    }

    /// @dev Set the node address this mini pool is attached too
    function setNodeDetails(address _nodeAddress) public onlyLatestRocketPool {
        rocketNodeAddress = _nodeAddress;
    }

    /// @dev Gets the current staking duration
    function setStakingDuration(uint256 _newStakingDuration) public onlyLatestRocketPool {
        stakingDuration = _newStakingDuration;
    }   

    /*** USERS ***********************************************/

    /// @dev Returns the user count for this pool
    function getUserCount() public view returns(uint256) {
        return userAddresses.length;
    }

    /// @dev Returns the true if the user is in this pool
    function getUserExists(address _userAddress) public view returns(bool) {
        return users[_userAddress].exists;
    }

    /// @dev Returns the users original address specified for withdrawals
    function getUserAddressFromBackupAddress(address _userBackupAddress) public view returns(address) {
        return usersBackupAddress[_userBackupAddress];
    }

    /// @dev Returns the true if the user has a backup address specified for withdrawals
    function getUserBackupAddressExists(address _userBackupAddress) public view returns(bool) {
        return usersBackupAddress[_userBackupAddress] != 0 ? true : false;
    }

    /// @dev Returns the true if the user has a backup address specified for withdrawals and that maps correctly to their original user address
    function getUserBackupAddressOK(address _userAddress, address _userBackupAddress) public view isPoolUser(_userAddress) returns(bool) {
        return usersBackupAddress[_userBackupAddress] == _userAddress ? true : false;
    }

    /// @dev Returns the true if the user has a deposit in this mini pool
    function getUserHasDeposit(address _userAddress) public view returns(bool) {
        return users[_userAddress].exists && users[_userAddress].balance > 0 ? true : false;
    }

    /// @dev Returns the amount of the users deposit
    function getUserDeposit(address _userAddress) public view isPoolUser(_userAddress) returns(uint256) {
        return users[_userAddress].balance;
    }

    /// @dev Returns the amount of the deposit tokens the user has taken out
    function getUserDepositTokensWithdrawn(address _userAddress) public view isPoolUser(_userAddress) returns(uint256) {
        return users[_userAddress].depositTokensWithdrawn;
    }

    /// @dev Returns the main user properties
    function getUser(address _userAddress) public view isPoolUser(_userAddress) returns(address, uint256, uint256) {
        return (users[_userAddress].partnerAddress, 
                users[_userAddress].balance,
                users[_userAddress].created
        );
    }

    /// @dev Returns the users partner address
    function getUserPartner(address _userAddress) public view isPoolUser(_userAddress) returns(address) {
        return users[_userAddress].partnerAddress;
    }

    /// @dev Rocket Pool updating the users balance, rewards earned and fees occured after staking and rewards are included
    function setUserBalanceRewardsFees(address _userAddress, uint256 _updatedBalance, int256 _updatedRewards, uint256 _updatedFees) public isPoolUser(_userAddress) onlyLatestRocketUser returns(bool) {
        // Will throw if conditions are not met in delegate
        require(rocketStorage.getAddress(keccak256("contract.name", "rocketPoolMiniDelegate")).delegatecall(bytes4(keccak256("setUserBalanceRewardsFees(address,uint256,int256,uint256)")), _userAddress, _updatedBalance, _updatedRewards, _updatedFees) == true);
        return true;
    }

    /// @dev Set current users address to the supplied backup one - be careful with this method when calling from the main Rocket Pool contract, all primary logic must be contained there as its upgradable
    function setUserAddressToCurrentBackupWithdrawal(address _userAddress, address _userAddressBackupWithdrawalGiven) public isPoolUser(_userAddress) onlyLatestRocketUser returns(bool) {
        require(rocketStorage.getAddress(keccak256("contract.name", "rocketPoolMiniDelegate")).delegatecall(bytes4(keccak256("setUserAddressToCurrentBackupWithdrawal(address,address)")), _userAddress, _userAddressBackupWithdrawalGiven) == true);
        return true;
    }

    /// @dev Adds more to the current amount of deposit tokens owed by the user
    function setUserDepositTokensOwedAdd(address _userAddress, uint256 _etherAmount, uint256 _tokenAmount) public isPoolUser(_userAddress) onlyLatestRocketUser returns(bool) {
        require(rocketStorage.getAddress(keccak256("contract.name", "rocketPoolMiniDelegate")).delegatecall(bytes4(keccak256("setUserDepositTokensOwedAdd(address,uint256,uint256)")), _userAddress, _etherAmount, _tokenAmount) == true);
        return true;
    }

    /// @dev Set the backup address for the user to collect their deposit + rewards from if the primary address doesn't collect it after a certain time period
    function setUserAddressBackupWithdrawal(address _userAddress, address _userAddressBackupWithdrawalNew) public isPoolUser(_userAddress) onlyLatestRocketUser returns(bool) {
        require(rocketStorage.getAddress(keccak256("contract.name", "rocketPoolMiniDelegate")).delegatecall(bytes4(keccak256("setUserAddressBackupWithdrawal(address,address)")), _userAddress, _userAddressBackupWithdrawalNew) == true);
        return true;
    }

    /// @dev Register a new user, only the latest version of the parent pool contract can do this
    /// @param _userAddressToAdd New user address
    /// @param _partnerAddressToAdd The 3rd party partner the user may belong too
    function addUser(address _userAddressToAdd, address _partnerAddressToAdd) public onlyLatestRocketPool returns(bool) {
        require(rocketStorage.getAddress(keccak256("contract.name", "rocketPoolMiniDelegate")).delegatecall(bytes4(keccak256("addUser(address,address)")), _userAddressToAdd, _partnerAddressToAdd) == true);
        return true;
    }

    /*** POOL ***********************************************/

    /// @dev Add a users deposit, only the latest version of the parent pool contract can send value here, so once a new version of Rocket Pool is released, existing mini pools can no longer receive deposits
    /// @param _userAddress Users account to accredit the deposit too
    function deposit(address _userAddress) public payable onlyLatestRocketUser returns(bool) {
        require(rocketStorage.getAddress(keccak256("contract.name", "rocketPoolMiniDelegate")).delegatecall(bytes4(keccak256("deposit(address)")), _userAddress) == true);
        return true;
    }

    /// @dev Allow the user to withdraw their deposit, only possible if the pool is in prelaunch, in countdown to launch or when Casper staking is completed, only the latest main RocketPool contract can make a withdrawal which is where the main checks occur (its upgradable)
    /// @param _userAddress Users account address
    /// @param _withdrawAmount amount you want to withdraw
    /// @return The balance remaining for the user
    function withdraw(address _userAddress, uint256 _withdrawAmount) public onlyLatestRocketUser returns (bool) {
        require(rocketStorage.getAddress(keccak256("contract.name", "rocketPoolMiniDelegate")).delegatecall(bytes4(keccak256("withdraw(address,uint256)")), _userAddress, _withdrawAmount) == true); 
        return true;
    }

    /// @dev Sets the status of the pool based on several parameters 
    function updateStatus() public returns(bool) {
        require(rocketStorage.getAddress(keccak256("contract.name", "rocketPoolMiniDelegate")).delegatecall(bytes4(keccak256("updateStatus()"))) == true);
        return true;
    }
    

}
