pragma solidity 0.5.8;

import "./RocketBase.sol";
import "./interface/RocketPoolInterface.sol";
import "./interface/utils/lists/AddressSetStorageInterface.sol";


/// @title Main node management contract
/// @author Jake Pospischil
contract RocketNode is RocketBase {


    /*** Contracts **************/


    RocketPoolInterface rocketPool = RocketPoolInterface(0);
    AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(0);


    /*** Constructor *************/


    /// @dev RocketNode constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }


    /*** Subscriptions ***********/


    /// @dev Minipool available status changed
    function onMinipoolAvailableChange(address, bool _available, address _nodeOwner, bool _trusted, string memory _durationID) public onlyLatestContract("utilPublisher", msg.sender) {

        // Set node available if minipool available and node active
        if (_available) {
            if (rocketStorage.getBool(keccak256(abi.encodePacked("node.active", _nodeOwner)))) { setNodeAvailable(_nodeOwner, _trusted, _durationID); }
        }

        // Set node unavailable if last minipool made unavailable
        else {
            rocketPool = RocketPoolInterface(getContractAddress("rocketPool"));
            if (rocketPool.getAvailableNodePoolsCount(_nodeOwner, _trusted, _durationID) == 0) { setNodeUnavailable(_nodeOwner, _trusted, _durationID); }
        }

    }


    /// @dev Node active status changed
    function onNodeActiveChange(address _nodeOwner, bool _active) public onlyLatestContract("utilPublisher", msg.sender) {

        // Trusted and duration ID types
        bool[2] memory trustedTypes = [true, false];
        string[3] memory durationIDs = ["3m", "6m", "12m"];
        for (uint256 ti = 0; ti < trustedTypes.length; ++ti) {
            for (uint256 di = 0; di < durationIDs.length; ++di) {

                // Set node available if active and has minipools
                if (_active) {
                    rocketPool = RocketPoolInterface(getContractAddress("rocketPool"));
                    if (rocketPool.getAvailableNodePoolsCount(_nodeOwner, trustedTypes[ti], durationIDs[di]) > 0) { setNodeAvailable(_nodeOwner, trustedTypes[ti], durationIDs[di]); }
                }

                // Set node unavailable if inactive
                else {
                    setNodeUnavailable(_nodeOwner, trustedTypes[ti], durationIDs[di]);
                }

            }
        }

    }


    /*** Getters *************/


    /// @dev Get the total number of available nodes (must have one or more available minipools)
    function getAvailableNodeCount(string memory _durationID) public returns (uint256) {
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        return
            addressSetStorage.getCount(keccak256(abi.encodePacked("nodes.available", false, _durationID))) +
            addressSetStorage.getCount(keccak256(abi.encodePacked("nodes.available", true, _durationID)));
    }
    function getAvailableNodeCount(bool _trusted, string memory _durationID) public returns (uint256) {
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        return addressSetStorage.getCount(keccak256(abi.encodePacked("nodes.available", _trusted, _durationID)));
    }


    /// @dev Get the address of a pseudorandom available node
    /// @return The node address and trusted status
    function getRandomAvailableNode(bool _trusted, string memory _durationID, uint256 _seed, uint256 _offset) public returns (address) {
        // Get contracts
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        // Node set key
        bytes32 key = keccak256(abi.encodePacked("nodes.available", _trusted, _durationID));
        // Get node count
        uint256 nodeCount = addressSetStorage.getCount(key);
        // No nodes available
        if (nodeCount == 0) { return address(0x0); }
        // Get random node from set
        uint256 randIndex = (uint256(keccak256(abi.encodePacked(block.number, block.timestamp, _seed))) + _offset) % nodeCount;
        return addressSetStorage.getItem(key, randIndex);
    }


    /*** Methods *************/


    /// @dev Set node availabile
    /// @dev Adds the node to the available index if not already present
    function setNodeAvailable(address _nodeOwner, bool _trusted, string memory _durationID) private {
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        if (addressSetStorage.getIndexOf(keccak256(abi.encodePacked("nodes.available", _trusted, _durationID)), _nodeOwner) == -1) {
            addressSetStorage.addItem(keccak256(abi.encodePacked("nodes.available", _trusted, _durationID)), _nodeOwner);
        }
    }


    /// @dev Set node unavailabile
    /// @dev Removes the node from the available index if already present
    function setNodeUnavailable(address _nodeOwner, bool _trusted, string memory _durationID) private {
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        if (addressSetStorage.getIndexOf(keccak256(abi.encodePacked("nodes.available", _trusted, _durationID)), _nodeOwner) != -1) {
            addressSetStorage.removeItem(keccak256(abi.encodePacked("nodes.available", _trusted, _durationID)), _nodeOwner);
        }
    }


}
