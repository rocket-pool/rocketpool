pragma solidity 0.7.6;
pragma abicoder v2;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../RocketBase.sol";
import "../../interface/node/RocketNodeManagerInterface.sol";
import "../../interface/rewards/claims/RocketClaimNodeInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol"; 
import "../../interface/util/AddressSetStorageInterface.sol";


// Node registration and management 
contract RocketNodeManager is RocketBase, RocketNodeManagerInterface {

    // Libraries
    using SafeMath for uint256;

    // Events
    event NodeRegistered(address indexed node, uint256 time);
    event NodeTimezoneLocationSet(address indexed node, uint256 time);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    // Get the number of nodes in the network
    function getNodeCount() override external view returns (uint256) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getCount(keccak256(abi.encodePacked("nodes.index")));
    }

    // Get a breakdown of the number of nodes per timezone
    function getNodeCountPerTimezone(uint256 offset, uint256 limit) override external view returns (TimezoneCount[] memory) {
        // Get contracts
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Precompute node key
        bytes32 nodeKey = keccak256(abi.encodePacked("nodes.index"));
        // Calculate range
        uint256 totalNodes = addressSetStorage.getCount(nodeKey);
        uint256 max = offset.add(limit);
        if (max > totalNodes || limit == 0) { max = totalNodes; }
        // Create an array with as many elements as there are potential values to return
        TimezoneCount[] memory counts = new TimezoneCount[](max.sub(offset));
        uint256 uniqueTimezoneCount = 0;
        // Iterate the minipool range
        for (uint256 i = offset; i < max; i++) {
            address nodeAddress = addressSetStorage.getItem(nodeKey, i);
            string memory timezone = getString(keccak256(abi.encodePacked("node.timezone.location", nodeAddress)));
            // Find existing entry in our array
            bool existing = false;
            for (uint256 j = 0; j < uniqueTimezoneCount; j++) {
                if (keccak256(bytes(counts[j].timezone)) == keccak256(bytes(timezone))) {
                    existing = true;
                    // Increment the counter
                    counts[j].count++;
                    break;
                }
            }
            // Entry was not found, so create a new one
            if (!existing) {
                counts[uniqueTimezoneCount].timezone = timezone;
                counts[uniqueTimezoneCount].count = 1;
                uniqueTimezoneCount++;
            }
        }
        // Dirty hack to cut unused elements off end of return value
        assembly {
            mstore(counts, uniqueTimezoneCount)
        }
        return counts;
    }

    // Get a node address by index
    function getNodeAt(uint256 _index) override external view returns (address) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return addressSetStorage.getItem(keccak256(abi.encodePacked("nodes.index")), _index);
    }

    // Check whether a node exists
    function getNodeExists(address _nodeAddress) override external view returns (bool) {
        return getBool(keccak256(abi.encodePacked("node.exists", _nodeAddress)));
    }

    // Get a node's current withdrawal address
    function getNodeWithdrawalAddress(address _nodeAddress) override external view returns (address) {
        return rocketStorage.getNodeWithdrawalAddress(_nodeAddress);
    }

    // Get a node's pending withdrawal address
    function getNodePendingWithdrawalAddress(address _nodeAddress) override external view returns (address) {
        return rocketStorage.getNodePendingWithdrawalAddress(_nodeAddress);
    }

    // Get a node's timezone location
    function getNodeTimezoneLocation(address _nodeAddress) override external view returns (string memory) {
        return getString(keccak256(abi.encodePacked("node.timezone.location", _nodeAddress)));
    }

    // Register a new node with Rocket Pool
    function registerNode(string calldata _timezoneLocation) override external onlyLatestContract("rocketNodeManager", address(this)) {
        // Load contracts
        RocketClaimNodeInterface rocketClaimNode = RocketClaimNodeInterface(getContractAddress("rocketClaimNode"));
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        // Check node settings
        require(rocketDAOProtocolSettingsNode.getRegistrationEnabled(), "Rocket Pool node registrations are currently disabled");
        // Check timezone location
        require(bytes(_timezoneLocation).length >= 4, "The timezone location is invalid");
        // Initialise node data
        setBool(keccak256(abi.encodePacked("node.exists", msg.sender)), true);
        setString(keccak256(abi.encodePacked("node.timezone.location", msg.sender)), _timezoneLocation);
        // Add node to index
        addressSetStorage.addItem(keccak256(abi.encodePacked("nodes.index")), msg.sender);
        // Register node for GGP claims
        rocketClaimNode.register(msg.sender, true);
        // Emit node registered event
        emit NodeRegistered(msg.sender, block.timestamp);
    }

    // Set a node's timezone location
    // Only accepts calls from registered nodes
    function setTimezoneLocation(string calldata _timezoneLocation) override external onlyLatestContract("rocketNodeManager", address(this)) onlyRegisteredNode(msg.sender) {
        // Check timezone location
        require(bytes(_timezoneLocation).length >= 4, "The timezone location is invalid");
        // Set timezone location
        setString(keccak256(abi.encodePacked("node.timezone.location", msg.sender)), _timezoneLocation);
        // Emit node timezone location set event
        emit NodeTimezoneLocationSet(msg.sender, block.timestamp);
    }

}
