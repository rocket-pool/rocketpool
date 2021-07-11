pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../interface/RocketStorageInterface.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/// @title The primary persistent storage for Rocket Pool
/// @author David Rugendyke

contract RocketStorage is RocketStorageInterface {

    // Events
    event NodeWithdrawalAddressSet(address indexed node, address indexed withdrawalAddress, uint256 time);

    // Libraries
    using SafeMath for uint256;

    // Complex storage maps
    mapping(bytes32 => string)     private stringStorage;
    mapping(bytes32 => bytes)      private bytesStorage;

    // Protected storage (not accessible by network contracts)
    mapping(address => address)    private withdrawalAddresses;
    mapping(address => address)    private pendingWithdrawalAddresses;

    // Flag storage has been initialised
    bool storageInit = false;

    /// @dev Only allow access from the latest version of a contract in the Rocket Pool network after deployment
    modifier onlyLatestRocketNetworkContract() {
        if (storageInit == true) {
            // Make sure the access is permitted to only contracts in our Dapp
            require(_getBool(keccak256(abi.encodePacked("contract.exists", msg.sender))), "Invalid or outdated network contract");
        } else {
            // Only Dapp and the guardian account are allowed access during initialisation.
            // tx.origin is only safe to use in this case for deployment since no external contracts are interacted with
            require((
                _getBool(keccak256(abi.encodePacked("contract.exists", msg.sender))) || _getBool(keccak256(abi.encodePacked("access.role", "guardian", tx.origin)))
            ), "Invalid or outdated network contract attempting access during deployment");
        }
        _;
    }


    /// @dev Construct RocketStorage
    constructor() {
        // Set the main guardian upon deployment
        _setBool(keccak256(abi.encodePacked("access.role", "guardian", msg.sender)), true);
    }

    // Set this as being deployed now
    function getDeployedStatus() external view returns (bool) {
        return storageInit;
    }

    // Set this as being deployed now
    function setDeployedStatus() external {
        // Only guardian can lock this down
        require(_getBool(keccak256(abi.encodePacked("access.role", "guardian", msg.sender))) == true, "Is not guardian account");
        // Set it now
        storageInit = true;
    }

    // Protected storage

    // Get a node's withdrawal address
    function getNodeWithdrawalAddress(address _nodeAddress) external override view returns (address) {
        // Check if _nodeAddress is a valid node
        if (!_getBool(keccak256(abi.encodePacked("node.exists", _nodeAddress)))) {
            return address(0);
        }
        // If no withdrawal address has been set, return the nodes address
        address withdrawalAddress = withdrawalAddresses[_nodeAddress];
        if (withdrawalAddress == address(0)) {
            return _nodeAddress;
        }
        return withdrawalAddress;
    }

    // Get a node's pending withdrawal address
    function getNodePendingWithdrawalAddress(address _nodeAddress) external override view returns (address) {
        return pendingWithdrawalAddresses[_nodeAddress];
    }

    // Set a node's withdrawal address
    function setWithdrawalAddress(address _nodeAddress, address _newWithdrawalAddress, bool _confirm) external override {
        // Check new withdrawal address
        require(_newWithdrawalAddress != address(0x0), "Invalid withdrawal address");
        // Confirm the transaction is from the node's current withdrawal address
        address withdrawalAddress = withdrawalAddresses[_nodeAddress];
        require(withdrawalAddress == msg.sender, "Only a tx from a node's withdrawal address can update it");
        // Update immediately if confirmed
        if (_confirm) {
            updateWithdrawalAddress(_nodeAddress, _newWithdrawalAddress);
        }
        // Set pending withdrawal address if not confirmed
        else {
            pendingWithdrawalAddresses[_nodeAddress] = _newWithdrawalAddress;
        }
    }

    // Confirm a node's new withdrawal address
    function confirmWithdrawalAddress(address _nodeAddress) external override {
        // Get node by pending withdrawal address
        require(pendingWithdrawalAddresses[_nodeAddress] == msg.sender, "Confirmation must come from the pending withdrawal address");
        delete pendingWithdrawalAddresses[_nodeAddress];
        // Update withdrawal address
        updateWithdrawalAddress(_nodeAddress, msg.sender);
    }

    // Update a node's withdrawal address
    function updateWithdrawalAddress(address _nodeAddress, address _newWithdrawalAddress) private {
        // Set new withdrawal address
        withdrawalAddresses[_nodeAddress] = _newWithdrawalAddress;
        // Emit withdrawal address set event
        emit NodeWithdrawalAddressSet(_nodeAddress, _newWithdrawalAddress, block.timestamp);
    }

    /// @param _key The key for the record
    function getAddress(bytes32 _key) override external view returns (address r) {
        assembly {
            r := sload (_key)
        }
    }

    /// @param _key The key for the record
    function getUint(bytes32 _key) override external view returns (uint256 r) {
        assembly {
            r := sload (_key)
        }
    }

    /// @param _key The key for the record
    function getString(bytes32 _key) override external view returns (string memory) {
        return stringStorage[_key];
    }

    /// @param _key The key for the record
    function getBytes(bytes32 _key) override external view returns (bytes memory) {
        return bytesStorage[_key];
    }

    /// @param _key The key for the record
    function getBool(bytes32 _key) override external view returns (bool r) {
        assembly {
            r := sload (_key)
        }
    }

    /// @param _key The key for the record
    function getInt(bytes32 _key) override external view returns (int r) {
        assembly {
            r := sload (_key)
        }
    }

    /// @param _key The key for the record
    function getBytes32(bytes32 _key) override external view returns (bytes32 r) {
        assembly {
            r := sload (_key)
        }
    }


    /// @param _key The key for the record
    function setAddress(bytes32 _key, address _value) onlyLatestRocketNetworkContract override external {
        assembly {
            sstore (_key, _value)
        }
    }

    /// @param _key The key for the record
    function setUint(bytes32 _key, uint _value) onlyLatestRocketNetworkContract override external {
        assembly {
            sstore (_key, _value)
        }
    }

    /// @param _key The key for the record
    function setString(bytes32 _key, string calldata _value) onlyLatestRocketNetworkContract override external {
        stringStorage[_key] = _value;
    }

    /// @param _key The key for the record
    function setBytes(bytes32 _key, bytes calldata _value) onlyLatestRocketNetworkContract override external {
        bytesStorage[_key] = _value;
    }

    /// @param _key The key for the record
    function setBool(bytes32 _key, bool _value) onlyLatestRocketNetworkContract override external {
        assembly {
            sstore (_key, _value)
        }
    }

    /// @param _key The key for the record
    function setInt(bytes32 _key, int _value) onlyLatestRocketNetworkContract override external {
        assembly {
            sstore (_key, _value)
        }
    }

    /// @param _key The key for the record
    function setBytes32(bytes32 _key, bytes32 _value) onlyLatestRocketNetworkContract override external {
        assembly {
            sstore (_key, _value)
        }
    }


    /// @param _key The key for the record
    function deleteAddress(bytes32 _key) onlyLatestRocketNetworkContract override external {
        assembly {
            sstore (_key, 0)
        }
    }

    /// @param _key The key for the record
    function deleteUint(bytes32 _key) onlyLatestRocketNetworkContract override external {
        assembly {
            sstore (_key, 0)
        }
    }

    /// @param _key The key for the record
    function deleteString(bytes32 _key) onlyLatestRocketNetworkContract override external {
        delete stringStorage[_key];
    }

    /// @param _key The key for the record
    function deleteBytes(bytes32 _key) onlyLatestRocketNetworkContract override external {
        delete bytesStorage[_key];
    }

    /// @param _key The key for the record
    function deleteBool(bytes32 _key) onlyLatestRocketNetworkContract override external {
        assembly {
            sstore (_key, 0)
        }
    }

    /// @param _key The key for the record
    function deleteInt(bytes32 _key) onlyLatestRocketNetworkContract override external {
        assembly {
            sstore (_key, 0)
        }
    }

    /// @param _key The key for the record
    function deleteBytes32(bytes32 _key) onlyLatestRocketNetworkContract override external {
        assembly {
            sstore (_key, 0)
        }
    }


    /// @param _key The key for the record
    /// @param _amount An amount to add to the record's value
    function addUint(bytes32 _key, uint256 _amount) onlyLatestRocketNetworkContract override external {
        assembly {
            let v := sload (_key)
            v := add(v, _amount)
            sstore (_key, v)
        }
    }

    /// @param _key The key for the record
    /// @param _amount An amount to subtract from the record's value
    function subUint(bytes32 _key, uint256 _amount) onlyLatestRocketNetworkContract override external {
        assembly {
            let v := sload (_key)
            v := sub(v, _amount)
            sstore (_key, v)
        }
    }

    // Private methods

    function _getBool(bytes32 _key) private view returns (bool r) {
        assembly {
            r := sload (_key)
        }
    }

    function _setBool(bytes32 _key, bool _value) private {
        assembly {
            sstore (_key, _value)
        }
    }
}
