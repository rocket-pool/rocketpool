pragma solidity 0.4.24;


// Interfaces
import "../../interface/RocketPoolInterface.sol";
import "../../interface/RocketStorageInterface.sol";
import "../../interface/settings/RocketGroupSettingsInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../interface/casper/CasperDepositInterface.sol";
import "../../interface/group/RocketGroupContractInterface.sol";
import "../../interface/token/ERC20.sol";
// Libraries
import "../../lib/SafeMath.sol";


/// @title The minipool delegate, should contain all primary logic for methods that minipools use, is entirely upgradable so that currently deployed pools can get any bug fixes or additions - storage here MUST match the minipool contract
/// @author David Rugendyke

contract RocketMinipoolDelegate {

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
    RocketGroupContractInterface rocketGroupContract = RocketGroupContractInterface(0);             // The users group contract that they belong too
    RocketGroupSettingsInterface rocketGroupSettings = RocketGroupSettingsInterface(0);             // The settings for groups
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
        bool    trusted;                                        // Was the node trusted at the time of minipool creation?
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
        uint256 feeRP;                                          // Rocket Pools fee
        uint256 feeGroup;                                       // Group fee
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

    /// @dev Only allow access from the latest version of the specified Rocket Pool contract
    modifier onlyLatestContract(string _contract) {
        require(msg.sender == getContractAddress(_contract), "Only the latest specified Rocket Pool contract can access this method.");
        _;
    }



    /*** Methods *************/
   
    /// @dev minipool constructor
    /// @param _rocketStorageAddress Address of Rocket Pools storage.
    constructor(address _rocketStorageAddress) public {
        // Update the storage contract address
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
        // Get minipool settings
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        // Set the address of the Casper contract
        casperDeposit = CasperDepositInterface(getContractAddress("casperDeposit"));
        // Add the RPL contract address
        rplContract = ERC20(getContractAddress("rocketPoolToken"));
    }
    

    /// @dev Get the the contracts address - This method should be called before interacting with any RP contracts to ensure the latest address is used
    function getContractAddress(string _contractName) private view returns(address) { 
        // Get the current API contract address 
        return rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", _contractName)));
    }

  
    

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


    // Methods

    /// @dev Deposit a users ether to this contract. Will register the user if they don't exist in this contract already.
    /// @param _user New user address
    /// @param _groupID The 3rd party group the user belongs too
    function deposit(address _user, address _groupID) public payable onlyLatestContract("rocketDepositQueue") returns(bool) {
        // Add this user if they are not currently in this minipool
        addUser(_user, _groupID);
        // Load contracts
        rocketPool = RocketPoolInterface(getContractAddress("rocketPool"));
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        // Make sure we are accepting deposits
        require(status.current == 0 || status.current == 1, "Minipool is not currently allowing deposits.");
        // Add to their balance
        users[_user].balance = users[_user].balance.add(msg.value);
        // Increase total network assigned ether
        rocketPool.increaseTotalEther("assigned", msg.value);
        // All good? Fire the event for the new deposit
        emit PoolTransfer(msg.sender, this, keccak256("deposit"), msg.value, users[_user].balance, now);
        // Update the status
        updateStatus();
        // Success
        return true;
    }

    /// @dev Register a new user in the minipool
    /// @param _user New user address
    /// @param _groupID The 3rd party group address the user belongs too
    function addUser(address _user, address _groupID) private returns(bool) {
        // Address exists?
        require(_user != address(0x0), "User address invalid.");
        // Get the users group contract 
        rocketGroupContract = RocketGroupContractInterface(_groupID);
        // Get the group settings
        rocketGroupSettings = RocketGroupSettingsInterface(getContractAddress("rocketGroupSettings"));
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
                feeRP: rocketGroupSettings.getDefaultFee(),
                feeGroup: rocketGroupContract.getFeePerc(),
                exists: true,
                created: now
            });
            // Store our node address so we can iterate over it if needed
            userAddresses.push(_user);
            // Fire the event
            emit UserAdded(_user, now);
            // Update the status of the pool
            updateStatus();
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


    // Setters

    /// @dev Change the status
    /// @param _newStatus status id to apply to the minipool
    function setStatus(uint8 _newStatus) private {
        // Fire the event if the status has changed
        if (_newStatus != status.current) {
            status.previous = status.current;
            status.current = _newStatus;
            status.changed = now;
            emit StatusChange(status.current, status.previous, status.changed);
        }
    }
    
    
    // Methods

    /// @dev All kids outta the pool - 
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
            // Close now and send the ether (+ rewards if it completed) back
            selfdestruct(node.contractAddress); 
        }
        // Nope
        return false;
    }


    /// @dev This pool has timeout - It has been stuck in status 1 for too long and has not begun staking yet, or it has completed staking and not all users have withdrawn their ether for a long time.
    function cancelPool() public returns(bool) {
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
            // Close now and send the ether (+ rewards if it completed) back
            selfdestruct(node.contractAddress); 
        }
        // Nope
        return false;
    }



    /// @dev Sets the status of the pool based on its current parameters 
    function updateStatus() public returns(bool) {
        // Get the RP interface
        rocketPool = RocketPoolInterface(getContractAddress("rocketPool"));
        // Set our status now - see RocketMinipoolSettings.sol for pool statuses and keys
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        /*
        // Check to see if we can close the pool
        // TODO: Fix minipool removal check and uncomment
        if (closePool()) {
            return true;
        }
        */
        // Set to Initialised - The last user has withdrawn their deposit after it there was previous users, revert minipool status to 0 to allow node operator to retrieve funds if desired
        if (getUserCount() == 0 && status.current <= 1) {
            // No users, reset the status to awaiting deposits
            setStatus(0);
            // Done
            return;
        }
        // Set to Prelaunch - Minipool has been assigned user(s) ether but not enough to begin staking yet. Node owners cannot withdraw their ether/rpl.
        if (getUserCount() == 1 && status.current == 0) {
            // Prelaunch
            setStatus(1);
            // Done
            return;
        }
        // Set to Staking - Minipool has received enough ether to begin staking, it's users and node owners ether is combined and sent to stake with Casper for the desired duration. Do not enforce the required ether, just send the right amount.
        if (getUserCount() > 0 && status.current == 1 && address(this).balance >= rocketMinipoolSettings.getMinipoolLaunchAmount()) {
            // If the node is not trusted, double check to make sure it has the correct RPL balance
            if(!node.trusted ) {
                require(rplContract.balanceOf(address(this)) >= node.depositRPL, "Nodes RPL balance does not match its intended staking balance.");
            }
            // TODO: send deposit to Casper contract
            // Set minipool availability status
            rocketPool.minipoolSetAvailable(false);
            // Staking
            setStatus(2);
            // Done
            return;
        }
        // Done
        return; 
    }

    


   

}