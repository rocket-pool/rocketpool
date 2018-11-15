pragma solidity 0.4.24;


// Interfaces
import "../../interface/RocketPoolInterface.sol";
import "../../interface/RocketStorageInterface.sol";
import "../../interface/settings/RocketGroupSettingsInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../interface/casper/ValidatorRegistrationInterface.sol";
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
    ValidatorRegistrationInterface validatorRegistration   = ValidatorRegistrationInterface(0);     // Interface of the Casper validator registration contract
    RocketGroupContractInterface rocketGroupContract = RocketGroupContractInterface(0);             // The users group contract that they belong too
    RocketGroupSettingsInterface rocketGroupSettings = RocketGroupSettingsInterface(0);             // The settings for groups
    RocketPoolInterface rocketPool = RocketPoolInterface(0);                                        // The main pool manager
    RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(0);    // The main settings contract most global parameters are maintained
    RocketStorageInterface rocketStorage = RocketStorageInterface(0);                               // The main Rocket Pool storage contract where primary persistant storage is maintained

    
    /*** Structs ***************/

    struct Status {
        uint8   current;                                        // The current status code, see RocketMinipoolSettings for more information
        uint8   previous;                                       // The previous status code
        uint256 time;                                           // The time the status last changed
        uint256 block;                                          // The block number the status last changed
    }

    struct Node {
        address owner;                                          // Etherbase address of the node which owns this minipool
        address contractAddress;                                // The nodes Rocket Pool contract
        uint256 depositEther;                                   // The nodes required ether contribution
        uint256 depositRPL;                                     // The nodes required RPL contribution
        bool    trusted;                                        // Was the node trusted at the time of minipool creation?
        bool    depositExists;                                  // The node operator's deposit exists
        uint256 balance;                                        // The node operator's ether balance
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
        uint256 addressIndex;                                   // User's index in the address list
    }


      
    /*** Events ****************/

    event NodeDeposit (
        address indexed _from,                                  // Transferred from
        uint256 etherAmount,                                    // Amount of ETH
        uint256 rplAmount,                                      // Amount of RPL
        uint256 created                                         // Creation timestamp
    );

    event NodeWithdrawal (
        address indexed _to,                                    // Transferred to
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
        address indexed _user,                                  // Users address
        uint256 created                                         // Creation timestamp
    );

    event UserRemoved (
        address indexed _user,                                  // Users address
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
        uint256 time,                                           // The last time the status changed
        uint256 block                                           // The last block number the status changed
    );

    event DepositTokenFundSent (
        address indexed _tokenContractAddress,                  // RPD Token Funds Sent
        uint256 amount,                                         // The amount sent
        uint256 created                                         // Creation timestamp
    );


    /*** Modifiers *************/


    /// @dev Only the node owner which this minipool belongs to
    /// @param _nodeOwner The node owner address.
    modifier isNodeOwner(address _nodeOwner) {
        require(_nodeOwner != address(0x0) && _nodeOwner == node.owner, "Incorrect node owner address passed.");
        _;
    }

    /// @dev Only the node contract which this minipool belongs to
    /// @param _nodeContract The node contract address
    modifier isNodeContract(address _nodeContract) {
        require(_nodeContract != address(0x0) && _nodeContract == node.contractAddress, "Incorrect node contract address passed.");
        _;
    }

    /// @dev Only registered users with this pool
    /// @param _user The users address.
    modifier isPoolUser(address _user) {
        require(_user != 0 && users[_user].exists != false, "Is not a pool user.");
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
        // Set the address of the validator registration contract
        validatorRegistration = ValidatorRegistrationInterface(getContractAddress("validatorRegistration"));
        // Add the RPL contract address
        rplContract = ERC20(getContractAddress("rocketPoolToken"));
    }
    

    /// @dev Get the the contracts address - This method should be called before interacting with any RP contracts to ensure the latest address is used
    function getContractAddress(string _contractName) private view returns(address) { 
        // Get the current API contract address 
        return rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", _contractName)));
    }

  
    

    /*** NODE ***********************************************/

    // Methods

    /// @dev Set the ether / rpl deposit and check it
    function nodeDeposit() public payable isNodeContract(msg.sender) returns(bool) {
        // Get minipool settings
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        // Check the RPL exists in the minipool now, should have been sent before the ether
        require(rplContract.balanceOf(address(this)) >= node.depositRPL, "RPL deposit size does not match the minipool amount set when it was created.");
        // Check it is the correct amount passed when the minipool was created
        require(msg.value == node.depositEther, "Ether deposit size does not match the minipool amount set when it was created.");
        // Check that the node operator has not already deposited
        require(node.depositExists == false, "Node owner has already made deposit for this minipool.");
        // Set node operator deposit flag & balance
        node.depositExists = true;
        node.balance = msg.value;
        // Fire deposit event
        emit NodeDeposit(msg.sender, msg.value, rplContract.balanceOf(address(this)), now);
        // All good
        return true;
    }

    /// @dev Withdraw ether / rpl deposit from the minipool if initialised, timed out or withdrawn
    function nodeWithdraw() public isNodeContract(msg.sender) returns(bool) {
        // Check current status
        require(status.current == 0 || status.current == 4 || status.current == 6, "Minipool is not currently allowing node withdrawals.");
        // Check node operator's deposit exists
        require(node.depositExists == true, "Node operator does not have a deposit in minipool.");
        // Get withdrawal amounts
        uint256 etherAmount = node.balance;
        uint256 rplAmount = rplContract.balanceOf(address(this));
        // Update node operator deposit flag & balance
        node.depositExists = false;
        node.balance = 0;
        // Transfer ether and RPL to node contract
        if (rplAmount > 0) { require(rplContract.transfer(node.contractAddress, rplAmount), "RPL balance transfer error."); }
        if (etherAmount > 0) { node.contractAddress.transfer(etherAmount); }
        // Fire withdrawal event
        emit NodeWithdrawal(msg.sender, etherAmount, rplAmount, now);
        // Update the status
        updateStatus();
        // Success
        return true;
    }


    /*** USERS ***********************************************/

    // Getters

    /// @dev Returns the user count for this pool
    function getUserCount() public view returns(uint256) {
        return userAddresses.length;
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
        rocketPool.setNetworkIncreaseTotalEther("assigned", staking.id, msg.value);
        // All good? Fire the event for the new deposit
        emit PoolTransfer(msg.sender, this, keccak256("deposit"), msg.value, users[_user].balance, now);
        // Update the status
        updateStatus();
        // Success
        return true;
    }

    /// @dev Withdraw a user's deposit and remove them from this contract.
    /// @param _user User address
    /// @param _groupID The 3rd party group the user belongs to
    /// @param _withdrawalAddress The address to withdraw the user's deposit to
    function withdraw(address _user, address _groupID, address _withdrawalAddress) public onlyLatestContract("rocketDeposit") returns(bool) {
        // Check current status
        require(status.current == 4 || status.current == 6, "Minipool is not currently allowing withdrawals.");
        // Check user address, group ID and balance
        require(users[_user].exists, "User does not exist in minipool.");
        require(users[_user].groupID == _groupID, "User does not exist in group.");
        require(users[_user].balance > 0, "User does not have remaining balance in minipool.");
        // Get remaining balance as withdrawal amount
        uint256 amount = users[_user].balance;
        // Remove user
        removeUser(_user);
        // Transfer withdrawal amount to withdrawal address
        require(_withdrawalAddress.call.value(amount)(), "Withdrawal amount could not be transferred to withdrawal address");
        // Decrease total network assigned ether
        rocketPool.setNetworkDecreaseTotalEther("assigned", staking.id, amount);
        // All good? Fire the event for the withdrawal
        emit PoolTransfer(this, _withdrawalAddress, keccak256("withdrawal"), amount, 0, now);
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
                created: now,
                addressIndex: userAddresses.length
            });
            // Store our user address so we can iterate over it if needed
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

    /// @dev Remove a user from the minipool
    /// @param _user User address
    function removeUser(address _user) private returns(bool) {
        // Check user exists
        require(users[_user].exists, "User does not exist in minipool.");
        // Remove user from address list
        userAddresses[users[_user].addressIndex] = userAddresses[userAddresses.length - 1];
        userAddresses.length--;
        // Delete user
        delete users[_user];
        // Fire the event
        emit UserRemoved(_user, now);
        // Update the status of the pool
        updateStatus();
        // Success
        return true;
    }



    /*** MINIPOOL  ******************************************/

    // Setters

    /// @dev Change the status
    /// @param _newStatus status id to apply to the minipool
    function setStatus(uint8 _newStatus) private {
        // Fire the event if the status has changed
        if (_newStatus != status.current) {
            status.previous = status.current;
            status.current = _newStatus;
            status.time = now;
            status.block = block.number;
            emit StatusChange(status.current, status.previous, status.time, status.block);
        }
    }
    
    
    // Methods


    /// @dev Sets the status of the pool based on its current parameters 
    function updateStatus() public returns(bool) {
        // Get the RP interface
        rocketPool = RocketPoolInterface(getContractAddress("rocketPool"));
        // Set our status now - see RocketMinipoolSettings.sol for pool statuses and keys
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        // Get minipool settings
        uint256 launchAmount = rocketMinipoolSettings.getMinipoolLaunchAmount();
        // Check to see if we can close the pool
        if (closePool()) {
            return true;
        }
        // Set to Prelaunch - Minipool has been assigned user(s) ether but not enough to begin staking yet. Node owners cannot withdraw their ether/rpl.
        if (getUserCount() == 1 && status.current == 0) {
            // Prelaunch
            setStatus(1);
            // Done
            return true;
        }
        // Set to Staking - Minipool has received enough ether to begin staking, it's users and node owners ether is combined and sent to stake with Casper for the desired duration. Do not enforce the required ether, just send the right amount.
        if (getUserCount() > 0 && status.current == 1 && address(this).balance >= launchAmount) {
            // If the node is not trusted, double check to make sure it has the correct RPL balance
            if(!node.trusted ) {
                require(rplContract.balanceOf(address(this)) >= node.depositRPL, "Nodes RPL balance does not match its intended staking balance.");
            }
            // Send deposit to validator registration contract
            // TODO: implement real validator registration arguments
            uint256 pubkeyVal = 1;
            while (validatorRegistration.usedPubkey(bytes32(pubkeyVal))) { ++pubkeyVal; }
            bytes32 pubkey = bytes32(pubkeyVal);
            uint256 withdrawalShardID = 1;
            address withdrawalAddress = address(this);
            bytes32 randaoCommitment = 0x0000000000000000000000000000000000000000000000000000000000000002;
            validatorRegistration.deposit.value(launchAmount)(pubkey, withdrawalShardID, withdrawalAddress, randaoCommitment);
            // Set minipool availability status
            rocketPool.setMinipoolAvailable(false); 
            // Staking
            setStatus(2);
            // Done
            return true;
        }
        // Set to TimedOut - If a minipool is widowed or stuck for a long time, it is classed as timed out (it has users, not enough to begin staking, but the node owner cannot close it)
        if (status.current == 1 && status.time <= (now - rocketMinipoolSettings.getMinipoolTimeout())) {
            // Set minipool availability status
            rocketPool.setMinipoolAvailable(false); 
            // TimedOut
            setStatus(6);
            // Done
            return true;
        }
        // Done
        return true; 
    }


    /// @dev All kids outta the pool - will close and self destruct this pool if the conditions are correct
    function closePool() private returns(bool) {
        // Get the RP interface
        rocketPool = RocketPoolInterface(getContractAddress("rocketPool"));
        // Remove the minipool if possible
        if(rocketPool.minipoolRemove()) {
            // Send any unclaimed RPL back to the node contract
            uint256 rplBalance = rplContract.balanceOf(address(this));
            if (rplBalance > 0) { require(rplContract.transfer(node.contractAddress, rplBalance), "RPL balance transfer error."); }
            // Log it
            emit PoolDestroyed(msg.sender, address(this), now);
            // Close now and send any unclaimed ether back to the node contract
            selfdestruct(node.contractAddress);
        }
        // Nope
        return false;
    }


}
