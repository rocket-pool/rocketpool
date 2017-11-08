pragma solidity ^0.4.17;

import "./RocketHub.sol";
import "./interface/RocketStorageInterface.sol";
import "./interface/RocketSettingsInterface.sol";
import "./interface/RocketPoolInterface.sol";
import "./contract/Owned.sol";


/// @title The Rocket Smart Node contract - more methods for nodes will be moved from RocketPool to here when metropolis is released
/// @author David Rugendyke

contract RocketNode is Owned {

    /**** Properties ***********/

    address private rocketHubAddress;                   // Hub address
    uint8 private version;                              // The current version of this contract                                   
    uint private minNodeWei;                            // Miniumum balance a node must have to cover gas costs for smart node services when registered


    /*** Contracts **************/

    RocketHub rocketHub = RocketHub(0);                 // The main RocketHub contract where primary persistant storage is maintained
    RocketStorageInterface rocketStorage = RocketStorageInterface(0);     // The main storage  contract where primary persistant storage is maintained  

              
    /*** Events ****************/

    event NodeRegistered (
        address indexed _nodeAddress,
        uint256 created
    );

    event NodeRemoved (
        address indexed _address,
        uint256 created
    );

    event FlagUint (
        uint256 flag
    );

    event FlagAddress (
        address flag
    );
   

    /*** Modifiers *************/


    /// @dev Only allow access from the latest version of the RocketPool contract
    modifier onlyLatestRocketPool() {
        assert (msg.sender == rocketHub.getAddress(keccak256("rocketPool")));
        _;
    }

    
    /*** Methods *************/
   
    /// @dev pool constructor
    function RocketNode(address _rocketStorageAddress) public {
        // Update the contract address
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
        // Set the min eth needed for a node account to cover gas costs
        minNodeWei = 5 ether;
    }


    /*** Getters *************/

    /// @dev Returns the amount of registered rocket nodes
    function getNodeCount() public constant returns(uint) {
        return rocketStorage.getUint(keccak256("nodes.total"));
    }


    /*** Setters *************/

    /// @dev Set the min eth required for a node to be registered
    /// @param amountInWei The amount in Wei
    function setMinNodeWei(uint amountInWei) public onlyOwner {
        minNodeWei = amountInWei;
    }


    /// @dev Get an available node for a pool to be assigned too
    // TODO: As well as assigning pools by node user server load, assign by node geographic region to aid in redundancy and decentralisation 
    function nodeAvailableForPool() public onlyLatestRocketPool view returns(address) {
        // Get all the current registered nodes
        uint256 nodeCount = rocketHub.getRocketNodeCount();
        // Create an array at the length of the current nodes, then populate it
        // This step would be infinitely easier and efficient if you could return variable arrays from external calls in solidity
        address[] memory nodes = new address[](nodeCount);
        address nodeAddressToUse = 0;
        uint256 prevAverageLoad = 0;
        // Retreive each node address now by index since we can't return a variable sized array from an external contract yet
        // TODO: Optimise when metropolis is in to use RETURNDATASIZE opcode
        assert(nodes.length > 0);
        // Now loop through each
        for (uint32 i = 0; i < nodes.length; i++) {
            // Get our node address
            address currentNodeAddress = rocketHub.getRocketNodeByIndex(i);
            // Get the node details
            uint256 averageLoad = rocketHub.getRocketNodeAverageLoad(currentNodeAddress);
            bool active = rocketHub.getRocketNodeActive(currentNodeAddress);
            // Get the node with the lowest current work load average to help load balancing and avoid assigning to any servers currently not activated
            // A node must also have checked in at least once before being assinged, hence why the averageLoad must be greater than zero
            nodeAddressToUse = (averageLoad <= prevAverageLoad || i == 0) && averageLoad > 0 && active == true ? currentNodeAddress : nodeAddressToUse;
            prevAverageLoad = averageLoad;
        }
        // We have an address to use, excellent, assign it
        if (nodeAddressToUse != 0) {
            return nodeAddressToUse;
        }
    } 


    /// @dev Register a new node address if it doesn't exist, only the contract creator can do this
    /// @param _newNodeAddress New nodes coinbase address
    /// @param _oracleID Current oracle identifier for this node (eg AWS, Rackspace etc)
    /// @param _instanceID The instance ID of the server to use on the oracle
    function setNode(address _newNodeAddress, string _oracleID, string _instanceID) public onlyOwner returns (bool) {
        // Check the address is ok
        require(_newNodeAddress != 0x0);
        // Get the balance of the node, must meet the min requirements to service gas costs for checkins, oracle services etc
        require(_newNodeAddress.balance >= minNodeWei);
        // Check it doesn't already exist
        require(!rocketStorage.getBool(keccak256("node.exists", _newNodeAddress)));
        // Get how many nodes we currently have  
        uint256 nodeCountTotal = rocketStorage.getUint(keccak256("nodes.total")); 
        // Ok now set our node data to key/value pair storage
        rocketStorage.setString(keccak256("node.oracleID", _newNodeAddress), _oracleID);
        rocketStorage.setString(keccak256("node.instanceID", _newNodeAddress), _instanceID);
        rocketStorage.setString(keccak256("node.region", _newNodeAddress), "tba");
        rocketStorage.setUint(keccak256("node.lastCheckin", _newNodeAddress), now);
        rocketStorage.setBool(keccak256("node.active", _newNodeAddress), true);
        rocketStorage.setBool(keccak256("node.exists", _newNodeAddress), true);
        // We store our nodes in an key/value array, so set its index so we can use an array to find it if needed
        rocketStorage.setUint(keccak256("node.index", _newNodeAddress), nodeCountTotal);
        // Update total nodes
        rocketStorage.setUint(keccak256("nodes.total"), nodeCountTotal + 1);
        // We also index all our nodes so we can do a reverse lookup based on its array index
        rocketStorage.setAddress(keccak256("nodes.index.reverse", nodeCountTotal), _newNodeAddress);
        // Fire the event
        NodeRegistered(_newNodeAddress, now);
        // All good
        return true;
    } 


    /// @dev Owner can manually activate or deactivate a node, this will stop the node accepting new pools to be assigned to it
    /// @param nodeAddress Address of the node
    /// @param activeStatus The status to set the node
    function nodeSetActiveStatus(address nodeAddress, bool activeStatus) public onlyOwner {
        // Get our RocketHub contract with the node storage, so we can check the node is legit
        rocketHub.setRocketNodeActive(nodeAddress, activeStatus);
    }


    /// @dev Remove a node from the Rocket Pool network
    function nodeRemove(address nodeAddress) public onlyOwner {
        // Get the hub
        RocketPoolInterface rocketPool = RocketPoolInterface(rocketHub.getAddress(keccak256("rocketPool")));
        // Check the node doesn't currently have any registered mini pools associated with it
        assert(rocketPool.getPoolsFilterWithNodeCount(nodeAddress) == 0);
        // Sets the rocket partner if the address is ok and isn't already set
        assert(rocketHub.setRocketNodeRemove(nodeAddress) == true);
        // Fire the event
        NodeRemoved(nodeAddress, now);
    } 

}
