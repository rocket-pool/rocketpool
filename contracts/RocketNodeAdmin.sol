pragma solidity 0.4.19;


import "./RocketNodeBase.sol";
import "./RocketPoolMini.sol"; 
import "./interface/RocketStorageInterface.sol";
import "./interface/RocketSettingsInterface.sol";
import "./interface/RocketPoolInterface.sol";
import "./interface/RocketUtilsInterface.sol";


/// @title The Rocket Smart Node contract
/// @author David Rugendyke
contract RocketNodeAdmin is RocketNodeBase {



    /*** Contracts **************/

    RocketUtilsInterface rocketUtils = RocketUtilsInterface(0);             // Utilities contract for various actions like signature verification
    RocketSettingsInterface rocketSettings = RocketSettingsInterface(0);    // The main settings contract most global parameters are maintained 

              
    /*** Events ****************/

    event NodeRegistered (
        address indexed _nodeAddress,
        uint256 created
    );

    event NodeRemoved (
        address indexed _address,
        uint256 created
    );

    event FlagAddress (
        address flag
    );

    event FlagBytes (
        bytes32 flag
    );
       

    /*** Modifiers *************/


    /// @dev Only allow access from the latest version of the RocketPool contract
    modifier onlyLatestRocketPool() {
        require(msg.sender == rocketStorage.getAddress(keccak256("contract.name", "rocketPool")));
        _;
    }
    
    /*** Methods *************/
   
    /// @dev pool constructor
    function RocketNodeAdmin(address _rocketStorageAddress) RocketNodeBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }

    /*** Getters *************/

    /// @dev Returns true if this node exists, reverts if it doesn't
    /// @param _nodeAddress node account address.
    function getNodeExists(address _nodeAddress) public view onlyRegisteredNode(_nodeAddress) returns(bool) {
        return true; 
    }

    /// @dev Returns the validation code address for a node
    /// @param _nodeAddress node account address.
    function getNodeValCodeAddress(address _nodeAddress) public view onlyRegisteredNode(_nodeAddress) returns(address) {
        return rocketStorage.getAddress(keccak256("node.valCodeAddress", _nodeAddress)); 
    }

    
    /// @dev Get an available node for a pool to be assigned too, is requested by the main Rocket Pool contract
    // TODO: As well as assigning pools by node user server load, assign by node geographic region to aid in redundancy and decentralisation 
    function getNodeAvailableForPool() external view onlyLatestRocketPool returns(address) {
        // Create an array at the length of the current nodes, then populate it
        address[] memory nodes = new address[](rocketStorage.getUint(keccak256("nodes.total")));
        address nodeAddressToUse = 0x0;
        uint256 prevAverageLoad = 0;
        // Retreive each node address now by index since we are using a key/value datastore
        require(nodes.length > 0);
        // Now loop through each, requires uint256 so that the hash matches the index correctly
        for (uint256 i = 0; i < nodes.length; i++) {
            // Get our node address
            address currentNodeAddress = rocketStorage.getAddress(keccak256("nodes.index.reverse", i));
            // Get the node details
            uint256 averageLoad = rocketStorage.getUint(keccak256("node.averageLoad", currentNodeAddress));
            // Get the node with the lowest current work load average to help load balancing and avoid assigning to any servers currently not activated
            // A node must also have checked in at least once before being assigned, hence why the averageLoad must be greater than zero
            nodeAddressToUse = (averageLoad <= prevAverageLoad || i == 0) && averageLoad > 0 && rocketStorage.getBool(keccak256("node.active", currentNodeAddress)) == true ? currentNodeAddress : nodeAddressToUse;
            prevAverageLoad = averageLoad;
        }
        // We have an address to use, excellent, assign it
        if (nodeAddressToUse != 0x0) {
            return nodeAddressToUse;
        }
    } 

    /*** Setters *************/


    /// @dev Owner can manually activate or deactivate a node, this will stop the node accepting new pools to be assigned to it
    /// @param _nodeAddress Address of the node
    /// @param _activeStatus The status to set the node
    function setNodeActiveStatus(address _nodeAddress, bool _activeStatus) public onlyRegisteredNode(_nodeAddress) onlyOwner {
        // Get our RocketHub contract with the node storage, so we can check the node is legit
        rocketStorage.setBool(keccak256("node.active", _nodeAddress), _activeStatus);
    }

    /// @dev Owner can change a nodes oracle ID ('aws', 'rackspace' etc)
    /// @param _nodeAddress Address of the node
    /// @param _oracleID The oracle ID
    function setNodeOracleID(address _nodeAddress, string _oracleID) public onlyRegisteredNode(_nodeAddress) onlyOwner {
        // Get our RocketHub contract with the node storage, so we can check the node is legit
        rocketStorage.setString(keccak256("node.oracleID", _nodeAddress), _oracleID);
    }

    /// @dev Owner can change a nodes instance ID ('aws', 'rackspace' etc)
    /// @param _nodeAddress Address of the node
    /// @param _instanceID The instance ID
    function setNodeInstanceID(address _nodeAddress, string _instanceID) public onlyRegisteredNode(_nodeAddress) onlyOwner {
        // Get our RocketHub contract with the node storage, so we can check the node is legit
        rocketStorage.setString(keccak256("node.instanceID", _nodeAddress), _instanceID);
    }

    /*** Methods ************/

    /// @dev Register a new node address if it doesn't exist, only the contract creator can do this
    /// @param _newNodeAddress New nodes coinbase address
    /// @param _providerID Current provider identifier for this node (eg AWS, Rackspace etc)
    /// @param _subnetID Current subnet identifier for this node (eg NViginia, Ohio etc)
    /// @param _instanceID The instance ID of the server (eg FA3422)
    /// @param _regionID The region ID of the server (aus-east, america-north etc)
    /// @param _valCodeAddress Casper validation contract address
    /// @param _sigHash A signed hash of some data
    /// @param _sig Signature used to sign hash
    function nodeAdd(address _newNodeAddress, string _providerID, string _subnetID, string _instanceID, string _regionID, address _valCodeAddress, bytes32 _sigHash, bytes _sig) public onlyOwner returns (bool) {
        // Get our settings
        rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        // Get our utilities
        rocketUtils = RocketUtilsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketUtils")));
        // Check the node address is ok
        require(_newNodeAddress != 0x0);
        // Check validation address is ok
        require(_valCodeAddress != 0x0);

        // Checks that the signature has been created by the node address
        require(rocketUtils.sigVerifyIsSigned(_newNodeAddress, _sigHash, _sig));

        // Calls the validation code contract passing it the signature and confirms that it returns 1 (true)
        rocketUtils.assertValidationContractIsValid(_valCodeAddress, _newNodeAddress, _sigHash, _sig);
        
        // Get the balance of the node, must meet the min requirements to service gas costs for checkins, voting etc
        require(_newNodeAddress.balance >= rocketSettings.getSmartNodeEtherMin());
        // Check it doesn't already exist
        require(!rocketStorage.getBool(keccak256("node.exists", _newNodeAddress)));
        // Get how many nodes we currently have  
        uint256 nodeCountTotal = rocketStorage.getUint(keccak256("nodes.total")); 
        // Ok now set our node data to key/value pair storage
        rocketStorage.setString(keccak256("node.providerID", _newNodeAddress), _providerID);
        rocketStorage.setString(keccak256("node.subnetID", _newNodeAddress), _subnetID);
        rocketStorage.setString(keccak256("node.instanceID", _newNodeAddress), _instanceID);
        rocketStorage.setString(keccak256("node.regionID", _newNodeAddress), _regionID);
        rocketStorage.setAddress(keccak256("node.valCodeAddress", _newNodeAddress), _valCodeAddress);
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
        rocketStorage.deleteString(keccak256("node.providerID", _nodeAddress));
        rocketStorage.deleteString(keccak256("node.subnetID", _nodeAddress));
        rocketStorage.deleteString(keccak256("node.instanceID", _nodeAddress));
        rocketStorage.deleteString(keccak256("node.regionID", _nodeAddress));
        rocketStorage.deleteAddress(keccak256("node.valCodeAddress", _nodeAddress));
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

}
