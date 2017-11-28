pragma solidity 0.4.18;

import "zeppelin-solidity/contracts/ownership/Ownable.sol";

import "./RocketPoolMini.sol"; 
import "./interface/RocketStorageInterface.sol";
import "./interface/RocketSettingsInterface.sol";
import "./interface/RocketPoolInterface.sol";

/// @title The Rocket Smart Node contract - more methods for nodes will be moved from RocketPool to here when metropolis is released
/// @author David Rugendyke

contract RocketNode is Ownable {

    /**** Properties ***********/

    address private rocketHubAddress;                   // Hub address
    uint8 private version;                              // The current version of this contract                                   
    uint private nodeMinWei;                            // Miniumum balance a node must have to cover gas costs for smart node services when registered
    bool private nodeSetInactiveAutomatic = true;       // Are nodes allowed to be set inactive by Rocket Pool automatically
    uint private nodeSetInactiveDuration = 1 hours;     // The duration between node checkins to make the node inactive (server failure, DDOS etc) and prevent new pools being assigned to it


    /*** Contracts **************/

    RocketStorageInterface rocketStorage = RocketStorageInterface(0);     // The main storage contract where primary persistant storage is maintained  

              
    /*** Events ****************/

    event NodeRegistered (
        address indexed _nodeAddress,
        uint256 created
    );

    event NodeRemoved (
        address indexed _address,
        uint256 created
    );

    event NodeCheckin (
        address indexed _nodeAddress,
        uint256 loadAverage,
        uint256 created
    );

    event NodeActiveStatus (
        address indexed _nodeAddress,
        bool indexed _active,
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
        assert(msg.sender == rocketStorage.getAddress(keccak256("contract.name", "rocketPool")));
        _;
    }

    /// @dev Only registered pool node addresses can access
    /// @param _nodeAccountAddress node account address.
    modifier onlyRegisteredNode(address _nodeAccountAddress) {
        require(rocketStorage.getBool(keccak256("node.exists", _nodeAccountAddress)));
        _;
    }

    
    /*** Methods *************/
   
    /// @dev pool constructor
    function RocketNode(address _rocketStorageAddress) public {
        // Update the contract address
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
        // Set the min eth needed for a node account to cover gas costs
        nodeMinWei = 5 ether;
    }


    /*** Getters *************/

    /// @dev Returns the amount of registered rocket nodes
    function getNodeCount() public view returns(uint) {
        return rocketStorage.getUint(keccak256("nodes.total"));
    }

    /// @dev Returns true if this node exists, reverts if it doesn't
    function getNodeExists(address _nodeAddress) public view onlyRegisteredNode(_nodeAddress) returns(bool) {
        return true;
    }

    /// @dev Get the duration between node checkins to make the node inactive
    function getNodeSetInactiveDuration() public view returns (uint256) {
        return nodeSetInactiveDuration;
    }
    
    /// @dev Get an available node for a pool to be assigned too, is requested by the main Rocket Pool contract
    // TODO: As well as assigning pools by node user server load, assign by node geographic region to aid in redundancy and decentralisation 
    function getNodeAvailableForPool() external view onlyLatestRocketPool returns(address) {
        // Create an array at the length of the current nodes, then populate it
        address[] memory nodes = new address[](rocketStorage.getUint(keccak256("nodes.total")));
        address nodeAddressToUse = 0x0;
        uint256 prevAverageLoad = 0;
        // Retreive each node address now by index since we are using a key/value datastore
        assert(nodes.length > 0);
        // Now loop through each, requires uint256 so that the hash matches the index correctly
        for (uint256 i = 0; i < nodes.length; i++) {
            // Get our node address
            address currentNodeAddress = rocketStorage.getAddress(keccak256("nodes.index.reverse", i));
            // Get the node details
            uint256 averageLoad = rocketStorage.getUint(keccak256("node.averageLoad", currentNodeAddress));
            // Get the node with the lowest current work load average to help load balancing and avoid assigning to any servers currently not activated
            // A node must also have checked in at least once before being assinged, hence why the averageLoad must be greater than zero
            nodeAddressToUse = (averageLoad <= prevAverageLoad || i == 0) && averageLoad > 0 && rocketStorage.getBool(keccak256("node.active", currentNodeAddress)) == true ? currentNodeAddress : nodeAddressToUse;
            prevAverageLoad = averageLoad;
        }
        // We have an address to use, excellent, assign it
        if (nodeAddressToUse != 0x0) {
            return nodeAddressToUse;
        }
    } 


    /*** Setters *************/

    /// @dev Set the min eth required for a node to be registered
    /// @param _amountInWei The amount in Wei
    function setNodeMinWei(uint _amountInWei) public onlyOwner {
        nodeMinWei = _amountInWei;
    }

    /// @dev Set the duration between node checkins to make the node inactive
    function setNodeInactiveDuration(uint256 _time) public onlyOwner {
        nodeSetInactiveDuration = _time;
    }

    /// @dev Are nodes allowed to be set inactive by Rocket Pool automatically
    function setNodeInactiveAutomatic(bool _allowed) public onlyOwner {
        nodeSetInactiveAutomatic = _allowed;
    }

    /// @dev Owner can manually activate or deactivate a node, this will stop the node accepting new pools to be assigned to it
    /// @param _nodeAddress Address of the node
    /// @param _activeStatus The status to set the node
    function setNodeActiveStatus(address _nodeAddress, bool _activeStatus) public onlyRegisteredNode(_nodeAddress) onlyOwner {
        // Get our RocketHub contract with the node storage, so we can check the node is legit
        rocketStorage.setBool(keccak256("node.active", _nodeAddress), _activeStatus);
    }


    /*** Methods ************/

    /// @dev Register a new node address if it doesn't exist, only the contract creator can do this
    /// @param _newNodeAddress New nodes coinbase address
    /// @param _oracleID Current oracle identifier for this node (eg AWS, Rackspace etc)
    /// @param _instanceID The instance ID of the server to use on the oracle
    function nodeAdd(address _newNodeAddress, string _oracleID, string _instanceID) public onlyOwner returns (bool) {
        // Check the address is ok
        require(_newNodeAddress != 0x0);
        // Get the balance of the node, must meet the min requirements to service gas costs for checkins, oracle services etc
        require(_newNodeAddress.balance >= nodeMinWei);
        // Check it doesn't already exist
        require(!rocketStorage.getBool(keccak256("node.exists", _newNodeAddress)));
        // Get how many nodes we currently have  
        uint256 nodeCountTotal = rocketStorage.getUint(keccak256("nodes.total")); 
        // Ok now set our node data to key/value pair storage
        rocketStorage.setString(keccak256("node.oracleID", _newNodeAddress), _oracleID);
        rocketStorage.setString(keccak256("node.instanceID", _newNodeAddress), _instanceID);
        rocketStorage.setString(keccak256("node.region", _newNodeAddress), "tba");
        rocketStorage.setUint(keccak256("node.averageLoad", _newNodeAddress), 0);
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


    
    /// @dev Remove a node from the Rocket Pool network
    /// @param _nodeAddress Address of the node
    function nodeRemove(address _nodeAddress) public onlyRegisteredNode(_nodeAddress) onlyOwner {
        // Get the main Rocket Pool contract
        RocketPoolInterface rocketPool = RocketPoolInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketPool")));
        // Check the node doesn't currently have any registered mini pools associated with it
        require(rocketPool.getPoolsFilterWithNodeCount(_nodeAddress) == 0);
        // Get total nodes
        uint256 nodesTotal = rocketStorage.getUint(keccak256("nodes.total"));
        // Now remove this nodes data from storage
        uint256 nodeIndex = rocketStorage.getUint(keccak256("node.index", _nodeAddress));
        rocketStorage.deleteUint(keccak256("node.lastCheckin", _nodeAddress));
        rocketStorage.deleteBool(keccak256("node.active", _nodeAddress));
        rocketStorage.deleteBool(keccak256("node.exists", _nodeAddress));
        rocketStorage.deleteUint(keccak256("node.index", _nodeAddress));
        // Delete reverse lookup
        rocketStorage.deleteAddress(keccak256("nodes.index.reverse", nodeIndex));
        // Update total
        rocketStorage.setUint(keccak256("nodes.total"), nodesTotal - 1);
        // Now reindex the remaining nodes
        nodesTotal = rocketStorage.getUint(keccak256("nodes.total"));
        // Loop
        for (uint i = nodeIndex+1; i <= nodesTotal; i++) {
            address nodeAddress = rocketStorage.getAddress(keccak256("nodes.index.reverse", i));
            uint256 newIndex = i - 1;
            rocketStorage.setUint(keccak256("node.index", nodeAddress), newIndex);
            rocketStorage.setAddress(keccak256("nodes.index.reverse", newIndex), nodeAddress);
        }
        // Fire the event
        NodeRemoved(_nodeAddress, now);
    } 


    /// @dev Nodes will checkin with Rocket Pool at a set interval (15 mins) to do things like report on average node server load, set nodes to inactive that have not checked in an unusally long amount of time etc. Only registered nodes can call this.
    /// @param _currentLoadAverage The average server load for the node over the last 15 mins
    function nodeCheckin(uint256 _currentLoadAverage) public onlyRegisteredNode(msg.sender) {
        // Get the hub
        RocketPoolInterface rocketPool = RocketPoolInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketPool")));
        // Fire the event
        NodeCheckin(msg.sender, _currentLoadAverage, now);
        // Updates the current 15 min load average on the node, last checkin time etc
        rocketStorage.setUint(keccak256("node.averageLoad", msg.sender), _currentLoadAverage);
        rocketStorage.setUint(keccak256("node.lastCheckin", msg.sender), now);
        // Now check with the main Rocket Pool contract what pool actions currently need to be done
        // This method is designed to only process one minipool from each node checkin every 15 mins to prevent the gas block limit from being exceeded and make load balancing more accurate
        // 1) Assign a node to a new minipool that can be launched
        // 2) Request deposit withdrawal from Casper for any minipools currently staking
        // 3) Actually withdraw the deposit from Casper once it's ready for withdrawal
        rocketPool.poolNodeActions();  
        // Now see what nodes haven't checked in recently and disable them if needed to prevent new pools being assigned to them
        if (nodeSetInactiveAutomatic == true) {
            // Create an array at the length of the current nodes, then populate it
            address[] memory nodes = new address[](getNodeCount());
            // Get each node now and check
            for (uint32 i = 0; i < nodes.length; i++) {
                // Get our node address
                address currentNodeAddress = rocketStorage.getAddress(keccak256("nodes.index.reverse", i));
                // We've already checked in as this node above
                if (msg.sender != currentNodeAddress) {
                    // Has this node reported in recently? If not, it may be down or in trouble, deactivate it to prevent new pools being assigned to it
                    if (rocketStorage.getUint(keccak256("node.lastCheckin", currentNodeAddress)) < (now - nodeSetInactiveDuration) && rocketStorage.getBool(keccak256("node.active", currentNodeAddress)) == true) {
                        // Disable the node - must be manually reactivated by the function above when its back online/running well
                        rocketStorage.setBool(keccak256("node.active", currentNodeAddress), false);
                        // Fire the event
                        NodeActiveStatus(currentNodeAddress, false, now);
                    }
                }
            }
        } 
    }

}
