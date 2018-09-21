pragma solidity 0.4.24;


// Interfaces
import "../../interface/RocketPoolInterface.sol";
import "../../interface/RocketStorageInterface.sol";
import "../../interface/api/RocketDepositAPIInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../interface/casper/CasperDepositInterface.sol";
import "../../interface/token/ERC20.sol";
// Libraries
import "../../lib/SafeMath.sol";


/// @title A minipool under the main RocketPool, all major logic is contained within the RocketPoolMiniDelegate contract which is upgradable when minipools are deployed
/// @author David Rugendyke

contract RocketMinipool {

    /*** Libs  *****************/

    using SafeMath for uint;


    /**** Properties ***********/

    // General
    uint8   public version = 1;                                 // Version of this contract
    Status  private status;                                     // The current status of this pool, statuses are declared via Enum in the minipool settings
    Node    private node;                                       // Node this minipool is attached to, its creator 
    Staking private staking;                                    // Staking properties of the minipool to track

    // Users
    mapping (address => User) private users;                    // Users in this pool
    mapping (address => address) private usersBackupAddress;    // Users backup withdrawal address => users current address in this pool, need these in a mapping so we can do a reverse lookup using the backup address
    address[] private userAddresses;                            // Users in this pool addresses for iteration
    


    /*** Contracts **************/

    ERC20 rplContract = ERC20(0);                                                                   // The address of our RPL ERC20 token contract
    CasperDepositInterface casperDeposit   = CasperDepositInterface(0);                             // Interface of the Casper deposit contract
    RocketDepositAPIInterface rocketDepositAPI = RocketDepositAPIInterface(0);                      // The Rocket Pool deposit API
    RocketPoolInterface rocketPool = RocketPoolInterface(0);                                        // The main pool manager
    RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(0);    // The main settings contract most global parameters are maintained
    RocketStorageInterface rocketStorage = RocketStorageInterface(0);                               // The main Rocket Pool storage contract where primary persistant storage is maintained

    
    /*** Structs ***************/

    struct Status {
        uint8   current;                                        // The current status code, see RocketMinipoolSettings for more information
        uint8   previous;                                       // The previous status code
        uint256 changed;                                        // The time the status last changed
    }

    struct Node {
        address owner;                                          // Etherbase address of the node which owns this minipool
        address contractAddress;                                // The nodes Rocket Pool contract
        uint256 depositEther;                                   // The nodes ether contribution
        uint256 depositRPL;                                     // The nodes RPL contribution
        bool    trusted;                                        // Is this a trusted node?
    }

    struct Staking {
         string id;                                             // Duration ID
        uint256 duration;                                       // Duration in blocks
        uint256 balanceStart;                                   // Ether balance of this minipool when it begins staking
        uint256 balanceEnd;                                     // Ether balance of this minipool when it completes staking
    }

    struct User {
        address user;                                           // Address of the user
        address backup;                                         // The backup address of the user
        address groupID;                                        // Address ID of the users group
        uint256 balance;                                        // Chunk balance deposited
         int256 rewards;                                        // Rewards received after Casper
        uint256 depositTokens;                                  // Rocket Pool deposit tokens withdrawn by the user on this minipool
        uint256 fees;                                           // TODO: Add separate fees for RP/Group
        uint256 created;                                        // Creation timestamp
        bool    exists;                                         // User exists?
    }

      
    /*** Events ****************/

    event NodeDeposit (
        address indexed _from,                                  // Transferred from
        uint256 etherAmount,                                    // Amount of ETH
        uint256 rplAmount,                                      // Amount of RPL
        uint256 created                                         // Creation timestamp
    );

    event PoolDestroyed (
        address indexed _user,                                  // User that triggered the close
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
        address indexed _user,                           // Users address
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


    /*** Modifiers *************/


    /// @dev Only the node owner which this minipool belongs too
    /// @param _nodeOwner The node owner address.
    modifier isNodeOwner(address _nodeOwner) {
        require(_nodeOwner != address(0x0) && _nodeOwner == node.owner, "Incorrect node owner address passed.");
        _;
    }

    /// @dev Only registered users with this pool
    /// @param _user The users address.
    modifier isPoolUser(address _user) {
        require(_user != 0 && users[_user].exists != false);
        _;
    }

    /// @dev Only allow access from the latest version of the RocketPool contract
    modifier onlyLatestRocketPool() {
        require(msg.sender == getContractAddress("rocketPool"), "Only the latest Rocket Pool contract can access this method.");
        _;
    }

    /// @dev Only allow access from the latest version of the RocketDeposit contract
    modifier onlyLatestRocketDeposit() {
        require(msg.sender == getContractAddress("rocketDeposit"), "Only the latest Rocket Deposit contract can access this method.");
        _;
    }



    /*** Methods *************/
   
    /// @dev minipool constructor
    /// @param _rocketStorageAddress Address of Rocket Pools storage.
    /// @param _nodeOwner The address of the nodes etherbase account that owns this minipool.
    /// @param _durationID Staking duration ID (eg 3m, 6m etc)
    /// @param _depositEther Ether amount deposited by the node owner
    /// @param _depositRPL RPL amount deposited by the node owner
    /// @param _trusted Is this node owner trusted?
    constructor(address _rocketStorageAddress, address _nodeOwner, string _durationID, uint256 _depositEther, uint256 _depositRPL, bool _trusted) public {
        // Update the storage contract address
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
        // Get minipool settings
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        // Set the address of the Casper contract
        casperDeposit = CasperDepositInterface(getContractAddress("casperDeposit"));
        // Add the RPL contract address
        rplContract = ERC20(getContractAddress("rocketPoolToken"));
        // Set the node owner and contract address
        node.owner = _nodeOwner;
        node.depositEther = _depositEther;
        node.depositRPL = _depositRPL;
        node.trusted = _trusted;
        node.contractAddress = rocketStorage.getAddress(keccak256(abi.encodePacked("node.contract", _nodeOwner)));
        // Set the initial staking properties
        staking.id = _durationID;
        staking.duration = rocketMinipoolSettings.getMinipoolStakingDuration(_durationID);
    }
    
    /// @dev Fallback function where our deposit + rewards will be received after requesting withdrawal from Casper
    function() public payable { 
        // Log the deposit received
        emit DepositReceived(msg.sender, msg.value, now);       
    }


    /// @dev Get the the contracts address - This method should be called before interacting with any API contracts to ensure the latest address is used
    function getContractAddress(string _contractName) private view returns(address) { 
        // Get the current API contract address 
        return rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", _contractName)));
    }

    /*
    /// @dev Use inline assembly to read the boolean value back from a delegatecall method in the minipooldelegate contract
    function getMiniDelegateBooleanResponse(bytes4 _signature) public returns (bool) {
        address minipoolDelegate = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketMinipoolDelegate")));
        bool response = false;
        assembly {
            let returnSize := 32
            let mem := mload(0x40)
            mstore(mem, _signature)
            let err := delegatecall(sub(gas, 10000), minipoolDelegate, mem, 0x04, mem, returnSize)
            response := mload(mem)
        }
        return response; 
    }

    */

   
    

    /*** NODE ***********************************************/

    // Getters

    /// @dev Gets the node contract address
    function getNodeOwner() public view returns(address) {
        return node.owner;
    }

    /// @dev Gets the node contract address
    function getNodeContract() public view returns(address) {
        return node.contractAddress;
    }

    /// @dev Gets the amount of ether the node owner must deposit
    function getNodeDepositEther() public view returns(uint256) {
        return node.depositEther;
    }
    
    /// @dev Gets the amount of RPL the node owner must deposit
    function getNodeDepositRPL() public view returns(uint256) {
        return node.depositRPL;
    }

    // Methods

    /// @dev Set the ether / rpl deposit and check it
    function nodeDeposit() public payable returns(bool) {
        // Get minipool settings
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        // Check the RPL exists in the minipool now, should have been sent before the ether
        require(rplContract.balanceOf(address(this)) >= node.depositRPL, "RPL deposit size does not match the minipool amount set when it was created.");
        // Check it is the correct amount passed when the minipool was created
        require(msg.value == node.depositEther, "Ether deposit size does not match the minipool amount set when it was created.");
        // Check it is the correct amount passed when the minipool was created
        require(address(this).balance >= node.depositEther, "Node owner has already made ether deposit for this minipool.");
        // Set it now
        node.depositEther = msg.value;
        node.depositRPL = rplContract.balanceOf(address(this));
        // Fire it
        emit NodeDeposit(msg.sender, msg.value,  rplContract.balanceOf(address(this)), now);
        // All good
        return true;
    }


    /*** USERS ***********************************************/

    // Getters

    /// @dev Returns the user count for this pool
    function getUserCount() public view returns(uint256) {
        return userAddresses.length;
    }

    /// @dev Returns the true if the user is in this pool
    function getUserExists(address _user) public view returns(bool) {
        return users[_user].exists;
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
    function getUserBackupAddressOK(address _user, address _userBackupAddress) public view isPoolUser(_user) returns(bool) {
        return usersBackupAddress[_userBackupAddress] == _user ? true : false;
    }

    /// @dev Returns the true if the user has a deposit in this mini pool
    function getUserHasDeposit(address _user) public view returns(bool) {
        return users[_user].exists && users[_user].balance > 0 ? true : false;
    }

    /// @dev Returns the amount of the users deposit
    function getUserDeposit(address _user) public view isPoolUser(_user) returns(uint256) {
        return users[_user].balance;
    }

    /// @dev Returns the amount of the deposit tokens the user has taken out
    function getUserDepositTokens(address _user) public view isPoolUser(_user) returns(uint256) {
        return users[_user].depositTokens;
    }


    // Methods

    /// @dev Deposit a users ether to this contract. Will register the user if they don't exist in this contract already.
    /// @param _user New user address
    /// @param _groupID The 3rd party group the user belongs too
    /// @param _groupDepositor The 3rd party group address that is making this deposit
    function deposit(address _user, address _groupID, address _groupDepositor) public payable returns(bool) {
        // Add this user if they are not currently in this minipool
        // Load contract
        rocketDepositAPI = RocketDepositAPIInterface(getContractAddress("rocketDepositAPI"));
        // Verify deposit is ok
        if(rocketDepositAPI.getDepositIsValid(msg.value, _groupDepositor, users[_user].groupID, _user, staking.id)) {
            // Add to their balance
            users[_user].balance = users[_user].balance.add(msg.value);
            // All good? Fire the event for the new deposit
            emit PoolTransfer(msg.sender, this, keccak256("deposit"), msg.value, users[_user].balance, now);
            // If all went well
            return true;
        }
        return false;
        
    }

    /// @dev Register a new user in the minipool
    /// @param _user New user address
    /// @param _groupID The 3rd party group the user belongs too
    function addUser(address _user, address _groupID) private returns(bool) {
        // Address exists?
        require(_user != address(0x0), "User address invalid.");
        // Check the user isn't already registered
        if (users[_user].exists == false) {
            // Add the new user to the mapping of User structs
            users[_user] = User({
                user: _user,
                backup: 0,
                groupID: _groupID,
                balance: 0,
                rewards: 0,
                depositTokens: 0,
                fees: 0,
                exists: true,
                created: now
            });
            // Store our node address so we can iterate over it if needed
            userAddresses.push(_user);
            // Fire the event
            emit UserAdded(_user, now);
            // Success
            return true;
        }
        return false;
    }



    /*** MINIPOOL  ******************************************/


    // Getters

    /// @dev Gets the current status of the minipool
    function getStatus() public view returns(uint8) {
        return status.current;
    }

    /// @dev Returns the time the status last changed to its current status
    function getStatusChanged() public view returns(uint256) {
        return status.changed;
    }

    /// @dev Returns the current staking duration in blocks
    function getStakingDuration() public view returns(uint256) {
        return staking.duration;
    }

    
    // Methods

    


    /// @dev All kids outta the pool
    function closePool() public returns(bool) {
        // Get the RP interface
        rocketPool = RocketPoolInterface(getContractAddress("rocketPool"));
        // Check to see we're allowed to close this pool
        if(rocketPool.minipoolRemoveCheck(msg.sender, address(this))) { 
            // Send back the RPL to the node owner
            require(rplContract.transfer(node.contractAddress, rplContract.balanceOf(address(this))), "RPL balance transfer error.");
            // Remove the minipool from storage
            rocketPool.minipoolRemove(address(this));
            // Log it
            emit PoolDestroyed(msg.sender, address(this), now);
            // Close now and send the ether back
            selfdestruct(node.contractAddress); 
        }
        // Nope
        return false;
    }


    /*
    /// @dev Closes the pool if the conditions are right
    function canClosePool() public returns(bool) {
        // TODO: Build on these conditions later as we integr
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
                    // ether left over from a users interest that have withdrawn all their ether as tokens already
                    // Send these to the RPD token contract to help increase its liquidity 
                    address depositTokenContract = rocketStorage.getAddress(keccak256("contract.name", "rocketDepositToken"));               
                    emit PoolTransfer(this, depositTokenContract, keccak256("poolClosing"), address(this).balance, 0, now);
                    // Now self destruct and send any dust left over
                    selfdestruct(depositTokenContract);
                    // Done
                    return true;
                }
            }
        }
        return false;
    }*/


   

}