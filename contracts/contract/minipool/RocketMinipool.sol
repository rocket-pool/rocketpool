pragma solidity 0.4.24;


// Interfaces
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
    uint8   public version;                                     // Version of this contract
    Node    private node;                                       // Node this minipool is attached to, its creator 
    Staking private staking;                                    // Staking properties of the minipool to track

    // Users
    mapping (address => User) private users;                    // Users in this pool
    address[] private userAddresses;                            // Users in this pool addresses for iteration


    /*** Contracts **************/

    ERC20 rplContract = ERC20(0);                                                                   // The address of our RPL ERC20 token contract
    CasperDepositInterface casperDeposit   = CasperDepositInterface(0);                             // Interface of the Casper deposit contract
    RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(0);    // The main settings contract most global parameters are maintained
    RocketStorageInterface rocketStorage = RocketStorageInterface(0);                               // The main Rocket Pool storage contract where primary persistant storage is maintained

    
    /*** Structs ***************/

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
        uint256 value,                                          // Value of the transfer
        uint256 created                                         // Creation timestamp
    );

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
        //require(_userAddress != 0 && users[_userAddress].exists != false);
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
        // The current version of this pool
        version = 1;
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


    /// @dev Returns the status of this pool
    function getStatus() public view returns(uint256) {
        //return status;
    }

    /// @dev Returns the time the status last changed to its current status
    function getStatusChangeTime() public view returns(uint256) {
        //return statusChangeTime;
    }
    */

    /*** NODE ***********************************************/


    /// @dev Gets the amount of ether the node owner must deposit
    function getNodeDepositEther() public view returns(uint256) {
        return node.depositEther;
    }
    
    /// @dev Gets the amount of RPL the node owner must deposit
    function getNodeDepositRPL() public view returns(uint256) {
        return node.depositRPL;
    }

    /// @dev Set the ether deposit and check it
    function setNodeDeposit() public payable returns(bool) {
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
        // Fire it
        emit NodeDeposit(msg.sender, msg.value, now);
        // All good
        return true;
    }

    /*** USERS ***********************************************/

    /// @dev Returns the user count for this pool
    function getUserCount() public view returns(uint256) {
        return userAddresses.length;
    }

   

}