pragma solidity 0.4.24;


// Interfaces
import "../../interface/RocketPoolInterface.sol";
import "../../interface/RocketStorageInterface.sol";
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
    uint8   public version = 1;                                     // Version of this contract
    Status  private status;                                      // The current status of this pool, statuses are declared via Enum in the minipool settings
    Node    private node;                                       // Node this minipool is attached to, its creator 
    Staking private staking;                                    // Staking properties of the minipool to track

    // Users
    mapping (address => User) private users;                    // Users in this pool
    address[] private userAddresses;                            // Users in this pool addresses for iteration


    /*** Contracts **************/

    ERC20 rplContract = ERC20(0);                                                                   // The address of our RPL ERC20 token contract
    CasperDepositInterface casperDeposit   = CasperDepositInterface(0);                             // Interface of the Casper deposit contract
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
        uint256 duration;                                       // Duration in blocks
        uint256 balanceStart;                                   // Ether balance of this minipool when it begins staking
        uint256 balanceEnd;                                     // Ether balance of this minipool when it completes staking
    }

    struct User {
        address userAddress;                                    // Address of the user
        address userAddressBackup;                              // Users backup withdrawal address
        address groupID;                                        // Address ID of the users group
        uint256 balance;                                        // Balance deposited
         int256 rewards;                                        // Rewards received after Casper
        uint256 depositTokens;                                  // Rocket Pool deposit tokens withdrawn by the user on this minipool
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


    /*** Modifiers *************/


    /// @dev Only the node owner which this minipool belongs too
    /// @param _nodeOwner The node owner address.
    modifier isNodeOwner(address _nodeOwner) {
        require(_nodeOwner != address(0x0) && _nodeOwner == node.owner, "Incorrect node owner address passed.");
        _;
    }

    /// @dev Only registered users with this pool
    /// @param _userAddress The users address.
    modifier isPoolUser(address _userAddress) {
        require(_userAddress != 0 && users[_userAddress].exists != false);
        _;
    }

    /// @dev Only allow access from the latest version of the RocketPool contract
    modifier onlyLatestRocketPool() {
        require(msg.sender == rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketPool"))), "Only the latest Rocket Pool contract can access this method.");
        _;
    }


    /*** Methods *************/
   
    /// @dev minipool constructor
    /// @param _rocketStorageAddress Address of Rocket Pools storage.
    /// @param _nodeOwner The address of the nodes etherbase account that owns this minipool.
    /// @param _duration Staking duration in blocks 
    /// @param _depositEther Ether amount deposited by the node owner
    /// @param _depositRPL RPL amount deposited by the node owner
    /// @param _trusted Is this node owner trusted?
    constructor(address _rocketStorageAddress, address _nodeOwner, uint256 _duration, uint256 _depositEther, uint256 _depositRPL, bool _trusted) public {
        // Update the storage contract address
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
        // Set the address of the Casper contract
        casperDeposit = CasperDepositInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "casperDeposit"))));
        // Add the RPL contract address
        rplContract = ERC20(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketPoolToken"))));
        // Set the node owner and contract address
        node.owner = _nodeOwner;
        node.depositEther = _depositEther;
        node.depositRPL = _depositRPL;
        node.trusted = _trusted;
        node.contractAddress = rocketStorage.getAddress(keccak256(abi.encodePacked("node.contract", _nodeOwner)));
        // Set the initial staking properties
        staking.duration = _duration;
    }
    
    /// @dev Fallback function where our deposit + rewards will be received after requesting withdrawal from Casper
    function() public payable { 
        // Log the deposit received
        emit DepositReceived(msg.sender, msg.value, now);       
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
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketMinipoolSettings"))));
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

    /// @dev Node owner can close their minipool if the conditions are right
    function nodeCloseMinipool() public isNodeOwner(msg.sender) {
        // Get the RP interfacce
        rocketPool = RocketPoolInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketPool"))));
        // Check to see if the node owner can close 
        if(rocketPool.minipoolDestroyCheck(msg.sender, address(this))) {
            // Send back the RPL
            require(rplContract.transfer(node.contractAddress, rplContract.balanceOf(address(this))), "RPL balance transfer errror");
            // Log it
            emit PoolDestroyed(msg.sender, address(this), now);
            // Close now and send the ether back
            selfdestruct(node.contractAddress);
        }
    }


    /*** USERS ***********************************************/

    // Getters

    /// @dev Returns the user count for this pool
    function getUserCount() public view returns(uint256) {
        return userAddresses.length;
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


    // Methods

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