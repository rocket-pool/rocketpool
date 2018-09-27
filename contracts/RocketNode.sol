pragma solidity 0.4.24;

import "./RocketBase.sol";
import "./interface/utils/lists/AddressSetStorageInterface.sol";


/// @title Main node management contract
/// @author Jake Pospischil
contract RocketNode is RocketBase {


    /*** Contracts **************/


    AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(0);                           // Address list utility


    /*** Constructor *************/


    /// @dev RocketNode constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }


    /*** Getters *************/


    /// @dev Get the address of a pseudorandom available node
    /// @return The node address and trusted status
    function getRandomAvailableNode(uint256 _nonce) public returns (address, bool) {
        // Get contracts
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        // Get node set type
        bool trusted;
        if (addressSetStorage.getCount(keccak256(abi.encodePacked("nodes.available", "trusted", false))) > 0) { trusted = false; } // Use untrusted nodes if available
        else if (addressSetStorage.getCount(keccak256(abi.encodePacked("nodes.available", "trusted", true))) > 0) { trusted = true; } // Use trusted nodes if available
        else { return (0x0, false); } // No nodes available
        // Get random node from set
        bytes32 key = keccak256(abi.encodePacked("nodes.available", "trusted", trusted));
        uint256 nodeCount = addressSetStorage.getCount(key);
        uint256 randIndex = uint256(keccak256(abi.encodePacked(block.number, block.timestamp, _nonce))) % nodeCount;
        return (addressSetStorage.getItem(key, randIndex), trusted);
    }


    /*** Methods *************/


    /// @dev Set node availabile
    /// @dev Adds the node to the available index if not already present
    function setNodeAvailable(address _nodeOwner, bool _trusted) public onlyLatestContract("rocketPool", msg.sender) {
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        if (addressSetStorage.getIndexOf(keccak256(abi.encodePacked("nodes.available", "trusted", _trusted)), _nodeOwner) == -1) {
            addressSetStorage.addItem(keccak256(abi.encodePacked("nodes.available", "trusted", _trusted)), _nodeOwner);
        }
    }


    /// @dev Set node unavailabile
    /// @dev Removes the node from the available index if already present
    function setNodeUnavailable(address _nodeOwner, bool _trusted) public onlyLatestContract("rocketPool", msg.sender) {
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        if (addressSetStorage.getIndexOf(keccak256(abi.encodePacked("nodes.available", "trusted", _trusted)), _nodeOwner) != -1) {
            addressSetStorage.removeItem(keccak256(abi.encodePacked("nodes.available", "trusted", _trusted)), _nodeOwner);
        }
    }


}
