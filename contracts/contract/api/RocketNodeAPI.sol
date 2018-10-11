pragma solidity 0.4.24;

// Contracts
import "../../RocketBase.sol";
// Interfaces
import "../../interface/RocketPoolInterface.sol";
import "../../interface/token/ERC20.sol";
import "../../interface/node/RocketNodeFactoryInterface.sol";
import "../../interface/node/RocketNodeContractInterface.sol";
import "../../interface/settings/RocketNodeSettingsInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
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
    RocketNodeSettingsInterface rocketNodeSettings = RocketNodeSettingsInterface(0);                        // Settings for the nodes
    RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(0);            // Settings for the minipools
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
    modifier onlyValidDuration(string _durationID) {
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
        rocketStorage.getAddress(keccak256(abi.encodePacked("node.contract", _nodeOwner)));
    }


    /// @dev Returns the timezone of the node as Country/City eg America/New_York
    /// @return string The set timezone of this node
    function getTimezoneLocation(address _nodeAddress) public view returns (string) {
        rocketStorage.getString(keccak256(abi.encodePacked("node.timezone.location", _nodeAddress)));
    }


    /// @dev Returns the amount of RPL required for a single ether
    /// @param _durationID The ID that determines which pool duration
    function getRPLRatio(string _durationID) public onlyValidDuration(_durationID) returns(uint256) { 
        // Get network utilisation as a fraction of 1 ether
        rocketPool = RocketPoolInterface(getContractAddress("rocketPool"));
        uint256 utilisation = rocketPool.getNetworkUtilisation();
        // Calculate RPL ratio based on utilisation rate of 0 - 50%; yields a maximum ratio of 5:1
        if (utilisation < 0.5 ether) {
            return -(utilisation / 95200000000000 - 5252) ** 5 + 1 ether;
        }
        // Calculate RPL ratio based on utilisation rate of 50 - 100%; yields a minimum ratio of 0:1
        else {
            return -(utilisation / 500000000000 - 1000000) ** 3 + 1 ether;
        }
    }


    /// @dev Returns the amount of RPL required to make an ether deposit based on the current network utilisation
    /// @param _weiAmount The amount of ether the node wishes to deposit
    /// @param _durationID The ID that determines which pool duration
    function getRPLRequired(uint256 _weiAmount, string _durationID) public onlyValidDuration(_durationID) returns(uint256) { 
        
        // TODO: Add in actual calculations using the quintic formula ratio - returns a 1:1 atm
        return _weiAmount; 
    }


    /// @dev Checks if the deposit reservations parameters are correct for a successful reservation
    /// @param _nodeOwner  The address of the nodes owner
    /// @param _value The amount being deposited
    /// @param _durationID The ID that determines which pool the user intends to join based on the staking blocks of that pool (3 months, 6 months etc)
    /// @param _rplRatio  The amount of RPL required per ether
    /// @param _lastDepositReservedTime  Time of the last reserved deposit
    function getDepositReservationIsValid(address _nodeOwner, uint256 _value, string _durationID, uint256 _rplRatio, uint256 _lastDepositReservedTime) public onlyValidNodeOwner(_nodeOwner) onlyValidDuration(_durationID) returns(bool) { 
        // Get the settings
        rocketNodeSettings = RocketNodeSettingsInterface(getContractAddress("rocketNodeSettings"));
        // Deposits turned on? 
        require(rocketNodeSettings.getDepositAllowed(), "Deposits are currently disabled for nodes.");
        // Is the deposit multiples of half needed to be deposited (node owners must deposit as much as we assign them)
        require(_value % (rocketMinipoolSettings.getMinipoolLaunchAmount().div(2)) == 0, "Ether deposit size must be half required for a deposit with Casper eg 16, 32, 64 ether.");
        // Only so many minipools can be created at once
        require(_value.div((rocketMinipoolSettings.getMinipoolLaunchAmount().div(2))) <= rocketMinipoolSettings.getMinipoolNewMaxAtOnce(), "Ether deposit exceeds the amount of minipools it can create at once, please reduce deposit size.");
        // Check the node operator doesn't have a reservation that's current, must wait for that to expire first or cancel it.
        require(now > (_lastDepositReservedTime + rocketNodeSettings.getDepositReservationTime()), "Only one deposit reservation can be made at a time, the current deposit reservation will expire in under 24hrs.");
        // Check the rpl ratio is valid
        require(_rplRatio < 3 ether, "RPL Ratio is too high.");
        // All ok
        return true;
    }


    /// @dev Checks if the deposit parameters are correct for a successful ether deposit
    /// @param _nodeOwner  The address of the nodes owner
    function getDepositIsValid(address _nodeOwner) public onlyValidNodeOwner(_nodeOwner) returns(bool) { 
        // Get the RPL contract 
        rplContract = ERC20(getContractAddress("rocketPoolToken"));
        // Get the node contract
        rocketNodeContract = RocketNodeContractInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("node.contract", _nodeOwner))));
        // Get the settings
        rocketNodeSettings = RocketNodeSettingsInterface(getContractAddress("rocketNodeSettings"));
        // Deposits turned on? 
        require(rocketNodeSettings.getDepositAllowed(), "Deposits are currently disabled for nodes.");
        // Check that they have a reserved deposit - will revert if one doesn't exist, double check tho
        require(rocketNodeContract.getHasDepositReservation() == true, "Node does not have a current deposit reserved or it has been longer than 24hrs since it was created.");
        // Does the node contract have sufficient ether to cover the reserved deposit?
        require(rocketNodeContract.getDepositReserveEtherRequired() <= address(rocketNodeContract).balance, "Node contract does not have enough ether to cover the reserved deposit.");
        // Does the node contract have sufficient RPL allowance to cover the reserved deposit?
        require(rocketNodeContract.getDepositReserveRPLRequired() <= rplContract.balanceOf(address(rocketNodeContract)), "Node contract does not have enough RPL to cover the reserved ether deposit.");
        // All good
        return true;
    }



    /*** Setters *************/


    /// @dev Returns the timezone of the node as Country/City eg America/New_York
    /// @param _timezoneLocation The location of the nodes timezone as Country/City eg America/New_York
    function setTimezoneLocation(string _timezoneLocation) public onlyValidNodeOwner(msg.sender) returns (string) {
        rocketStorage.setString(keccak256(abi.encodePacked("node.timezone.location", msg.sender)), _timezoneLocation);
    }
 

    /*** Methods *************/

    /// @dev Register a new node address if it doesn't exist
    /// @param _timezoneLocation The location of the nodes timezone as Country/City eg America/New_York
    function add(string _timezoneLocation) public onlyLatestContract("rocketNodeAPI", address(this)) returns (bool) {
        // Get the node settings
        rocketNodeSettings = RocketNodeSettingsInterface(getContractAddress("rocketNodeSettings"));
        // Get the node factory
        rocketNodeFactory = RocketNodeFactoryInterface(getContractAddress("rocketNodeFactory"));
        // Get the list utility
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        // Initial address check
        require(address(msg.sender) != address(0x0), "An error has occurred with the sending address.");
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
        rocketStorage.setUint(keccak256(abi.encodePacked("node.lastCheckin", msg.sender)), 0);
        rocketStorage.setBool(keccak256(abi.encodePacked("node.trusted", msg.sender)), false);
        rocketStorage.setBool(keccak256(abi.encodePacked("node.active", msg.sender)), true);
        rocketStorage.setBool(keccak256(abi.encodePacked("node.exists", msg.sender)), true);
        // Store our node address as an index set
        addressSetStorage.addItem(keccak256(abi.encodePacked("nodes", "list")), msg.sender); 
        // Log it
        emit NodeAdd(msg.sender, newContractAddress, now);
        // Done
        return true;
    }


    /// @dev Process a deposit into a nodes contract
    /// @param _nodeOwner  The address of the nodes owner
    function deposit(address _nodeOwner) public onlyValidNodeOwner(_nodeOwner) onlyValidNodeContract(_nodeOwner, msg.sender) returns(address[]) { 
        // Check the deposit is ready to go first
        if(getDepositIsValid(_nodeOwner)) {
            // Get the minipool settings contract
            rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
            // Get the node contract
            rocketNodeContract = RocketNodeContractInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("node.contract", _nodeOwner))));
            // Get Rocket Pool contract
            rocketPool = RocketPoolInterface(getContractAddress("rocketPool"));
            // Get the deposit duration in blocks by using its ID
            string memory durationID = rocketNodeContract.getDepositReserveDurationID();
            // Ether deposited
            uint256 etherDeposited = rocketNodeContract.getDepositReserveEtherRequired();
            // RPL deposited
            uint256 rplDeposited = rocketNodeContract.getDepositReserveRPLRequired();
            // How many minipools are we making? each should have half the casper amount from the node
            uint256 minipoolAmount = etherDeposited.div((rocketMinipoolSettings.getMinipoolLaunchAmount().div(2)));
            // Store our minipool addresses
            address[] memory minipools = new address[](minipoolAmount);
            // Create minipools
            for(uint8 i = 0; i < minipoolAmount; i++) {
                // Build that bad boy 
                minipools[i] = rocketPool.minipoolCreate(_nodeOwner, durationID, etherDeposited.div(minipoolAmount), rplDeposited.div(minipoolAmount), rocketStorage.getBool(keccak256(abi.encodePacked("node.trusted", msg.sender))));
            }
             // Return the minipool addresses
            return minipools;
        }
    }

    /*
    /// @dev Save a public key for this node from a newly generated account
    /// @param _account  The address of an account controlled by the node owner
    /// @param _pubkey  The pubkey of a new account on the node to use for this deposit
    function pubKeyAdd(address _account, bytes _pubkey) public onlyValidNodeOwner(msg.sender) returns(bool) { 
        // Get our contracts
        bytesSetStorage = BytesSetStorageInterface(getContractAddress("utilBytesSetStorage"));
        // Pubkeys should only ever be used once 
        require(rocketStorage.getBytes(keccak256(abi.encodePacked("pubkey.used", _pubkey))).length > 0, "Pubkey has already been used by a node.");
        // Accounts should only ever be used once 
        require(rocketStorage.getAddress(keccak256(abi.encodePacked("pubkey.account", _account))) != address(0x0), "Account has already been used by a node.");
        // Pubkey should have a length of greater than 32 bytes (64 mostly, but not always)
        require(_pubkey.length >= 32, "Pubkey is too short.");
        // Verify this pubkey is for the supplied address - the extra padding gets it to the correct length
        require(uint256(keccak256(abi.encodePacked(_pubkey)) & 0x00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF) == uint256(_account));
        // Add it as a key, but an unverified one
        rocketStorage.setBool(keccak256(abi.encodePacked("account.pubkey.verified", _pubkey)), false);
        // Add it to that nodes list
        bytesSetStorage.addItem(keccak256(abi.encodePacked("node.pubkey", msg.sender)), _pubkey); 
        // Done
        return true;
    }

    /// @dev Verify a public key for an account that belongs to a node
    /// @param _pubkey  The pubkey of a new account on the node to use for this deposit
    function pubKeyVerify(bytes _pubkey) public returns(bool) { 
        // Verify this pubkey is for the supplied address - the extra padding gets it to the correct length
        require(uint256(keccak256(abi.encodePacked(_pubkey)) & 0x00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF) == uint256(msg.sender));
        // Its verified
        rocketStorage.setBool(keccak256(abi.encodePacked("pubkey.verified", _pubkey)), true);
        // Done
        return true;
    }
    */

}