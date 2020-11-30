pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/node/RocketNodeManagerInterface.sol";
import "../../interface/settings/RocketNodeSettingsInterface.sol";
import "../../interface/util/AddressSetStorageInterface.sol";
import "../../interface/rewards/claims/RocketClaimTrustedNodeInterface.sol";


// Node registration and management 
contract RocketNodeManager is RocketBase, RocketNodeManagerInterface {

    // Events
    event NodeRegistered(address indexed node, uint256 time);
    event NodeTrustedSet(address indexed node, bool trusted, uint256 time);
    event NodeTimezoneLocationSet(address indexed node, uint256 time);

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Get the number of nodes in the network
    function getNodeCount() override public view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getCount(keccak256(abi.encodePacked("nodes.index")));
    }

    // Get a node address by index
    function getNodeAt(uint256 _index) override public view returns (address) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getItem(keccak256(abi.encodePacked("nodes.index")), _index);
    }

    // Get the number of trusted nodes in the network
    // TODO: Move to DAO contract
    function getTrustedNodeCount() override public view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getCount(keccak256(abi.encodePacked("nodes.trusted.index")));
    }

    // Get a trusted node address by index
    function getTrustedNodeAt(uint256 _index) override public view returns (address) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getItem(keccak256(abi.encodePacked("nodes.trusted.index")), _index);
    }

    // Check whether a node exists
    function getNodeExists(address _nodeAddress) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked("node.exists", _nodeAddress)));
    }

    // Check whether a node is trusted
    function getNodeTrusted(address _nodeAddress) override public view returns (bool) {
        return getBool(keccak256(abi.encodePacked("node.trusted", _nodeAddress)));
    }

    // Get a node's timezone location
    function getNodeTimezoneLocation(address _nodeAddress) override public view returns (string memory) {
        return getString(keccak256(abi.encodePacked("node.timezone.location", _nodeAddress)));
    }

    // Register a new node with Rocket Pool
    function registerNode(string calldata _timezoneLocation) override external onlyLatestContract("rocketNodeManager", address(this)) {
        // Load contracts
        RocketNodeSettingsInterface rocketNodeSettings = RocketNodeSettingsInterface(getContractAddress("rocketNodeSettings"));
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Check node settings
        require(rocketNodeSettings.getRegistrationEnabled(), "Rocket Pool node registrations are currently disabled");
        // Check timezone location
        require(bytes(_timezoneLocation).length >= 4, "The timezone location is invalid");
        // Check node is not registered
        require(!getBool(keccak256(abi.encodePacked("node.exists", msg.sender))), "The node is already registered in the Rocket Pool network");
        // Initialise node data
        setBool(keccak256(abi.encodePacked("node.exists", msg.sender)), true);
        setBool(keccak256(abi.encodePacked("node.trusted", msg.sender)), false);
        setString(keccak256(abi.encodePacked("node.timezone.location", msg.sender)), _timezoneLocation);
        // Add node to index
        addressSetStorage.addItem(keccak256(abi.encodePacked("nodes.index")), msg.sender);
        // Emit node registered event
        emit NodeRegistered(msg.sender, now);
    }

    
    // Register a trusted node to receive rewards  
    // Enable trusted nodes to call this themselves in case the rewards contract for them was disabled for any reason when they were set as trusted
    // TODO: Move to Trusted node DAO contract when ready
    function setRegisterNodeTrustedRewards(address _nodeAddress, bool _enable) private onlyTrustedNode(_nodeAddress) {
        // Load contracts
        RocketClaimTrustedNodeInterface rewardsClaimTrustedNode = RocketClaimTrustedNodeInterface(getContractAddress("rocketClaimTrustedNode"));
        // Verify the trust nodes rewards contract is enabled 
        if(rewardsClaimTrustedNode.getEnabled()) {
            if(_enable) {
                // Register
                rewardsClaimTrustedNode.register(_nodeAddress, true); 
            }else{
                // Unregister
                rewardsClaimTrustedNode.register(_nodeAddress, false); 
            }
        }
    }
 
    // Enable trusted nodes to call this themselves in case the rewards contract for them was disabled for any reason when they were set as trusted
    // TODO: Move to Trusted node DAO contract when ready
    function registerNodeTrustedRewards(bool _enable) override public onlyTrustedNode(msg.sender) {
        setRegisterNodeTrustedRewards(msg.sender, _enable);
    }


    // Set a node's trusted status
    // Only accepts calls from super users
    // TODO: Move to Trusted node DAO contract when ready
    function setNodeTrusted(address _nodeAddress, bool _trusted) override external onlyLatestContract("rocketNodeManager", address(this)) onlyOwner {
        // Check node exists
        require(getBool(keccak256(abi.encodePacked("node.exists", _nodeAddress))), "The node does not exist");
        // Check current node status
        require(getBool(keccak256(abi.encodePacked("node.trusted", _nodeAddress))) != _trusted, "The node's trusted status is already set");
        // Load contracts
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Add node to / remove node from trusted index
        if (_trusted) { 
            // Set status
            setBool(keccak256(abi.encodePacked("node.trusted", _nodeAddress)), true);
            // Add to index
            addressSetStorage.addItem(keccak256(abi.encodePacked("nodes.trusted.index")), _nodeAddress); 
            // Register them to claim rewards
            setRegisterNodeTrustedRewards(_nodeAddress, true);
            
        }
        else { 
            // Remove them from the claims register
            setRegisterNodeTrustedRewards(_nodeAddress, false);
            // Remove index
            addressSetStorage.removeItem(keccak256(abi.encodePacked("nodes.trusted.index")), _nodeAddress);
            // Set status now - has to be done after rewards claims are removed to verify they were a legit trusted node
            setBool(keccak256(abi.encodePacked("node.trusted", _nodeAddress)), false);
        }
        // Emit node trusted set event
        emit NodeTrustedSet(_nodeAddress, _trusted, now);
    }

    // Set a node's timezone location
    // Only accepts calls from registered nodes
    function setTimezoneLocation(string calldata _timezoneLocation) override external onlyLatestContract("rocketNodeManager", address(this)) onlyRegisteredNode(msg.sender) {
        // Check timezone location
        require(bytes(_timezoneLocation).length >= 4, "The timezone location is invalid");
        // Set timezone location
        setString(keccak256(abi.encodePacked("node.timezone.location", msg.sender)), _timezoneLocation);
        // Emit node timezone location set event
        emit NodeTimezoneLocationSet(msg.sender, now);
    }

}
