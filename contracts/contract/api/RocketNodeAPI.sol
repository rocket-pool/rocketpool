pragma solidity 0.5.0;

// Contracts
import "../../RocketBase.sol";
// Interfaces
import "../../interface/RocketPoolInterface.sol";
import "../../interface/token/ERC20.sol";
import "../../interface/node/RocketNodeFactoryInterface.sol";
import "../../interface/node/RocketNodeContractInterface.sol";
import "../../interface/node/RocketNodeTasksInterface.sol";
import "../../interface/settings/RocketNodeSettingsInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../interface/utils/lists/AddressQueueStorageInterface.sol";
import "../../interface/utils/lists/AddressSetStorageInterface.sol";
import "../../interface/utils/lists/BytesSetStorageInterface.sol";
// Libraries
import "../../lib/SafeMath.sol";



/// @title Handles node API methods in the Rocket Pool infrastructure
/// @author David Rugendyke

contract RocketNodeAPI is RocketBase {

    /*** Libs  *****************/

    using SafeMath for uint;


    /*** Contracts *************/

    RocketPoolInterface rocketPool = RocketPoolInterface(0);
    ERC20 rplContract = ERC20(0);                                                                           // The address of our RPL ERC20 token contract
    RocketNodeFactoryInterface rocketNodeFactory = RocketNodeFactoryInterface(0);                           // Node contract factory
    RocketNodeContractInterface rocketNodeContract = RocketNodeContractInterface(0);                        // Node contract 
    RocketNodeTasksInterface rocketNodeTasks = RocketNodeTasksInterface(0);                                 // Node task manager
    RocketNodeSettingsInterface rocketNodeSettings = RocketNodeSettingsInterface(0);                        // Settings for the nodes
    RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(0);            // Settings for the minipools
    AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(0);                     // Address list utility
    AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(0);                           // Address list utility
    BytesSetStorageInterface bytesSetStorage = BytesSetStorageInterface(0);                                 // Bytes list utility


    /*** Events ****************/

    event NodeAdd (
        address indexed ID,                                                 // Node ID
        address indexed contractAddress,                                    // Nodes Rocket Pool contract
        uint256 created                                                     // The time this deposit was made
    );

    event NodeDeposit (
        address indexed ID,                                                 // Node ID that sent the deposit
        uint256 etherAmount,                                                // Amount of ether required
        uint256 rplAmount,                                                  // Amount of RPL required
        uint256 rplRatio,                                                   // Amount of RPL required per single ether deposited
        string  durationID,                                                 // Duration of the stake
        address minipool,                                                   // Address of the minipool created by the deposit
        uint256 created                                                     // The time this deposit was made
    );


    // TODO: Remove Flag Events
    event FlagAddress (
        address flag
    );

    event FlagString (
        string flag
    );

    event FlagUint (
        uint256 flag
    );

       
    /*** Modifiers *************/

    /// @dev Only passes if the user calling it is a registered node owner
    modifier onlyValidNodeOwner(address _nodeOwner) {
        // Verify it
        require(rocketStorage.getBool(keccak256(abi.encodePacked("node.exists", _nodeOwner))) == true, "Node owner is not valid.");
        _;
    }


    /// @dev Only passes if the node contract exists and is registered to the specified owner
    modifier onlyValidNodeContract(address _nodeOwner, address _nodeContract) {
        require(rocketStorage.getAddress(keccak256(abi.encodePacked("node.contract", _nodeOwner))) == _nodeContract, "Node contract is not valid.");
        _;
    }


    /// @dev Only passes if the supplied minipool duration is valid
    /// @param _durationID The ID that determines the minipool duration
    modifier onlyValidDuration(string memory _durationID) {
        // Get our minipool settings
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        // Check to verify the supplied mini pool staking time id is legit, it will revert if not
        rocketMinipoolSettings.getMinipoolStakingDuration(_durationID);
        _;
    }
  
       
    /*** Constructor *************/

    /// @dev rocketNode constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }


    /*** Getters *************/

    /// @dev Returns the contract address where the nodes ether/rpl deposits will reside
    /// @return address The address of the contract
    function getContract(address _nodeOwner) public view returns (address) {
        return rocketStorage.getAddress(keccak256(abi.encodePacked("node.contract", _nodeOwner)));
    }


    /// @dev Returns the timezone of the node as Country/City eg America/New_York
    /// @return string The set timezone of this node
    function getTimezoneLocation(address _nodeAddress) public view returns (string memory) {
        return rocketStorage.getString(keccak256(abi.encodePacked("node.timezone.location", _nodeAddress)));
    }


    /// @dev Returns the amount of RPL required for a single ether
    /// @param _durationID The ID that determines which pool duration
    function getRPLRatio(string memory _durationID) public onlyValidDuration(_durationID) returns(uint256) { 
        // Get network utilisation as a fraction of 1 ether
        rocketPool = RocketPoolInterface(getContractAddress("rocketPool"));
        uint256 utilisation = rocketPool.getNetworkUtilisation(_durationID);
        // Calculate RPL ratio based on utilisation rate of 0 - 50%; yields a maximum ratio of 5:1
        if (utilisation < 0.5 ether) {
            return -(utilisation / 109400000000000 - 4570) ** 5 + 1 ether;
        }
        // Calculate RPL ratio based on utilisation rate of 50 - 100%; yields a minimum ratio of 0:1
        else {
            return -(utilisation / 500000000000 - 1000000) ** 3 + 1 ether;
        }
    }


    /// @dev Returns the amount of RPL required, and the RPL ratio, to make an ether deposit based on the current network utilisation
    /// @param _weiAmount The amount of ether the node wishes to deposit
    /// @param _durationID The ID that determines which pool duration
    function getRPLRequired(uint256 _weiAmount, string memory _durationID) public returns(uint256, uint256) {
        uint256 rplRatio = getRPLRatio(_durationID);
        return (_weiAmount.mul(rplRatio).div(1 ether), rplRatio);
    }


    /// @dev Checks if the deposit reservations parameters are correct for a successful reservation
    /// @param _nodeOwner  The address of the nodes owner
    /// @param _durationID The ID that determines which pool the user intends to join based on the staking blocks of that pool (3 months, 6 months etc)
    /// @param _lastDepositReservedTime  Time of the last reserved deposit
    function checkDepositReservationIsValid(address _nodeOwner, string memory _durationID, uint256 _lastDepositReservedTime) public onlyValidNodeOwner(_nodeOwner) onlyValidDuration(_durationID) {
        // Get the settings
        rocketNodeSettings = RocketNodeSettingsInterface(getContractAddress("rocketNodeSettings"));
        // Deposits turned on? 
        require(rocketNodeSettings.getDepositAllowed(), "Deposits are currently disabled for nodes.");
        // Check the node operator doesn't have a reservation that's current, must wait for that to expire first or cancel it.
        require(now > _lastDepositReservedTime.add(rocketNodeSettings.getDepositReservationTime()), "Only one deposit reservation can be made at a time, the current deposit reservation will expire in under 24hrs.");
    }


    /// @dev Checks if the deposit parameters are correct for a successful ether deposit
    /// @param _nodeOwner  The address of the nodes owner
    function checkDepositIsValid(address _nodeOwner) private onlyValidNodeOwner(_nodeOwner) {
        // Get the RPL contract 
        rplContract = ERC20(getContractAddress("rocketPoolToken"));
        // Get the node contract
        rocketNodeContract = RocketNodeContractInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("node.contract", _nodeOwner))));
        // Get the settings
        rocketNodeSettings = RocketNodeSettingsInterface(getContractAddress("rocketNodeSettings"));
        // Deposits turned on? 
        require(rocketNodeSettings.getDepositAllowed(), "Deposits are currently disabled for nodes.");
        // Does the node contract have sufficient ether to cover the reserved deposit?
        require(rocketNodeContract.getDepositReserveEtherRequired() <= address(rocketNodeContract).balance, "Node contract does not have enough ether to cover the reserved deposit.");
        // Does the node contract have sufficient RPL to cover the reserved deposit?
        require(rocketNodeContract.getDepositReserveRPLRequired() <= rplContract.balanceOf(address(rocketNodeContract)), "Node contract does not have enough RPL to cover the reserved deposit.");
    }



    /*** Setters *************/


    /// @dev Returns the timezone of the node as Country/City eg America/New_York
    /// @param _timezoneLocation The location of the nodes timezone as Country/City eg America/New_York
    function setTimezoneLocation(string memory _timezoneLocation) public onlyValidNodeOwner(msg.sender) returns (string memory) {
        rocketStorage.setString(keccak256(abi.encodePacked("node.timezone.location", msg.sender)), _timezoneLocation);
    }
 

    /*** Methods *************/

    /// @dev Register a new node address if it doesn't exist
    /// @param _timezoneLocation The location of the nodes timezone as Country/City eg America/New_York
    function add(string memory _timezoneLocation) public onlyLatestContract("rocketNodeAPI", address(this)) returns (bool) {
        // Get the node settings
        rocketNodeSettings = RocketNodeSettingsInterface(getContractAddress("rocketNodeSettings"));
        // Get the node factory
        rocketNodeFactory = RocketNodeFactoryInterface(getContractAddress("rocketNodeFactory"));
        // Get the list utility
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        // Check the timezone location exists
        require(bytes(_timezoneLocation).length >= 4, "Node timezone supplied is invalid.");
        // Check registrations are allowed
        require(rocketNodeSettings.getNewAllowed() == true, "Group registrations are currently disabled in Rocket Pool");
        // Get the balance of the node, must meet the min requirements to service gas costs for checkins etc
        require(msg.sender.balance >= rocketNodeSettings.getEtherMin(), "Node account requires a minimum amount of ether in it for registration.");
        // Check it isn't already registered
        require(!rocketStorage.getBool(keccak256(abi.encodePacked("node.exists", msg.sender))), "Node address already exists in the Rocket Pool network.");
        // Ok create the nodes contract now, this is the address where their ether/rpl deposits will reside
        address newContractAddress = rocketNodeFactory.createRocketNodeContract(msg.sender);
        // Make sure we can find the node contract address via its owner
        rocketStorage.setAddress(keccak256(abi.encodePacked("node.contract", msg.sender)), newContractAddress);
        // Ok now set our node data to key/value pair storage
        rocketStorage.setString(keccak256(abi.encodePacked("node.timezone.location", msg.sender)), _timezoneLocation);
        rocketStorage.setUint(keccak256(abi.encodePacked("node.averageLoad", msg.sender)), 0);
        rocketStorage.setUint(keccak256(abi.encodePacked("node.feeVote", msg.sender)), 0);
        rocketStorage.setUint(keccak256(abi.encodePacked("node.lastCheckin", msg.sender)), now);
        rocketStorage.setBool(keccak256(abi.encodePacked("node.trusted", msg.sender)), false);
        rocketStorage.setBool(keccak256(abi.encodePacked("node.active", msg.sender)), true);
        rocketStorage.setBool(keccak256(abi.encodePacked("node.exists", msg.sender)), true);
        // Store our node address as an index set
        addressSetStorage.addItem(keccak256(abi.encodePacked("nodes", "list")), msg.sender); 
        // Add node to checkin queue
        addressQueueStorage = AddressQueueStorageInterface(getContractAddress("utilAddressQueueStorage"));
        addressQueueStorage.enqueueItem(keccak256(abi.encodePacked("nodes.checkin.queue")), msg.sender);
        // Log it
        emit NodeAdd(msg.sender, newContractAddress, now);
        // Done
        return true;
    }


    /// @dev Process a deposit into a nodes contract
    /// @param _nodeOwner  The address of the nodes owner
    function deposit(address _nodeOwner) public onlyValidNodeOwner(_nodeOwner) onlyValidNodeContract(_nodeOwner, msg.sender) returns(address) { 
        // Check the deposit is ready to go first
        checkDepositIsValid(_nodeOwner);
        // Get the minipool settings contract
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        // Get the node contract
        rocketNodeContract = RocketNodeContractInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("node.contract", _nodeOwner))));
        // Get Rocket Pool contract
        rocketPool = RocketPoolInterface(getContractAddress("rocketPool"));
        // Get the deposit duration ID
        string memory durationID = rocketNodeContract.getDepositReserveDurationID();
        // Ether deposited
        uint256 etherDeposited = rocketNodeContract.getDepositReserveEtherRequired();
        // RPL deposited
        uint256 rplDeposited = rocketNodeContract.getDepositReserveRPLRequired();
        // Create minipool and return address
        return rocketPool.minipoolCreate(_nodeOwner, durationID, etherDeposited, rplDeposited, rocketStorage.getBool(keccak256(abi.encodePacked("node.trusted", _nodeOwner))));
    }


    /// @dev Perform a node checkin
    /// @param _nodeOwner The address of the node owner
    /// @param _averageLoad The average server load on the node over the last checkin period, as a fraction of 1 ether
    /// @param _nodeFeeVote The node fee percentage vote: 0 = no change; 1 = increase; 2 = decrease
    function checkin(address _nodeOwner, uint256 _averageLoad, uint256 _nodeFeeVote) public onlyValidNodeOwner(_nodeOwner) onlyValidNodeContract(_nodeOwner, msg.sender) returns(bool) {
        // Check average load
        require(_averageLoad <= 1 ether, "Invalid average load");
        // Check node fee percentage vote
        require(_nodeFeeVote >= 0 && _nodeFeeVote <= 2, "Invalid node fee vote");
        // Record average load
        rocketStorage.setUint(keccak256(abi.encodePacked("node.averageLoad", _nodeOwner)), _averageLoad);
        // Record node fee percentage vote
        rocketStorage.setUint(keccak256(abi.encodePacked("node.feeVote", _nodeOwner)), _nodeFeeVote);
        // Record last checkin time
        rocketStorage.setUint(keccak256(abi.encodePacked("node.lastCheckin", _nodeOwner)), now);
        // Run node tasks
        rocketNodeTasks = RocketNodeTasksInterface(getContractAddress("rocketNodeTasks"));
        rocketNodeTasks.run(_nodeOwner);
        // Done
        return true;
    }


}
