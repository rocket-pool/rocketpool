pragma solidity 0.4.24;

// Contracts
import "../../RocketBase.sol";
import "../node/RocketNodeContract.sol";
// Interfaces
import "../../interface/settings/RocketNodeSettingsInterface.sol";



/// @title Handles node API methods in the Rocket Pool infrastructure
/// @author David Rugendyke

contract RocketNodeAPI is RocketBase {

    /*** Libs  *****************/

    /*** Contracts *************/

    RocketNodeSettingsInterface rocketNodeSettings = RocketNodeSettingsInterface(0);           // Settings for the nodes 
   


    /*** Events ****************/

    event NodeAdd (
        address indexed ID,
        address indexed contractAddress,
        uint256 created
    );


    // TODO: Remove Flag Events
    event FlagString (
        string flag
    );

    event FlagUint (
        uint256 flag
    );

       
    /*** Modifiers *************/

    /// @dev Only passes if the user calling it is a registered node
    modifier onlyNode(address _nodeAddress) {
        require(rocketStorage.getBool(keccak256(abi.encodePacked("node.exists", _nodeAddress))), "Node address does not exist.");
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
    function getContract(address _nodeAddress) public view returns (address) {
        rocketStorage.getAddress(keccak256(abi.encodePacked("node.contract", _nodeAddress)));
    }

    /// @dev Returns the timezone of the node as Country/City eg America/New_York
    /// @return string The set timezone of this node
    function getTimezoneLocation(address _nodeAddress) public view returns (string) {
        rocketStorage.getString(keccak256(abi.encodePacked("node.timezone.location", _nodeAddress)));
    }


    /*** Setters *************/


    /// @dev Returns the timezone of the node as Country/City eg America/New_York
    /// @param _timezoneLocation The location of the nodes timezone as Country/City eg America/New_York
    function setTimezoneLocation(string _timezoneLocation) public onlyNode(msg.sender) returns (string) {
        rocketStorage.setString(keccak256(abi.encodePacked("node.timezone.location", msg.sender)), _timezoneLocation);
    }
 

    /*** Methods *************/

    /// @dev Register a new node address if it doesn't exist
    /// @param _timezoneLocation The location of the nodes timezone as Country/City eg America/New_York
    function add(string _timezoneLocation) public onlyLatestContract("rocketNodeAPI", address(this)) returns (bool) {
        // Get the group settings
        rocketNodeSettings = RocketNodeSettingsInterface(getContractAddress("rocketNodeSettings"));
        // Initial address check
        require(address(msg.sender) != address(0x0), "An error has occurred with the sending address.");
        // Check the timezone location exists
        require(bytes(_timezoneLocation).length >= 4, "Node timezone supplied is invalid.");
        // Check registrations are allowed
        require(rocketNodeSettings.getNewAllowed() == true, "Group registrations are currently disabled in Rocket Pool");
        // Get the balance of the node, must meet the min requirements to service gas costs for checkins etc
        require(msg.sender.balance >= rocketNodeSettings.getEtherMin());
        // Check it isn't already registered
        require(!rocketStorage.getBool(keccak256(abi.encodePacked("node.exists", msg.sender))), "Node address already exists in the Rocket Pool network.");
        // Ok create the nodes contract now, this is the address where their ether/rpl deposits will reside
        RocketNodeContract newContractAddress = new RocketNodeContract(address(rocketStorage));
        // Get how many nodes we currently have  
        uint256 nodeCountTotal = rocketStorage.getUint(keccak256("nodes.total")); 
        // Ok now set our node data to key/value pair storage
        rocketStorage.setAddress(keccak256(abi.encodePacked("node.contract", msg.sender)), newContractAddress);
        rocketStorage.setString(keccak256(abi.encodePacked("node.timezone.location", msg.sender)), _timezoneLocation);
        rocketStorage.setUint(keccak256(abi.encodePacked("node.averageLoad", msg.sender)), 0);
        rocketStorage.setUint(keccak256(abi.encodePacked("node.lastCheckin", msg.sender)), 0);
        rocketStorage.setBool(keccak256(abi.encodePacked("node.active", msg.sender)), true);
        rocketStorage.setBool(keccak256(abi.encodePacked("node.exists", msg.sender)), true);
        // We store our nodes in an key/value array, so set its index so we can use an array to find it if needed
        rocketStorage.setUint(keccak256(abi.encodePacked("node.index", msg.sender)), nodeCountTotal);
        // Update total nodes
        rocketStorage.setUint(keccak256(abi.encodePacked("nodes.total")), nodeCountTotal + 1);
        // We also index all our nodes so we can do a reverse lookup based on its array index
        rocketStorage.setAddress(keccak256(abi.encodePacked("nodes.index.reverse", nodeCountTotal)), msg.sender);
        // Log it
        emit NodeAdd(msg.sender, newContractAddress, now);
        // Done
        return true;
    }

}