// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketBase} from "../RocketBase.sol";
import {RocketMegapoolDelegateBaseInterface} from "../../interface/megapool/RocketMegapoolDelegateBaseInterface.sol";
import {RocketMegapoolStorageLayout} from "./RocketMegapoolStorageLayout.sol";
import {RocketNodeManagerInterface} from "../../interface/node/RocketNodeManagerInterface.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";

/// @dev All megapool delegate contracts must extend this base to include the expected deprecation functionality
contract RocketMegapoolDelegateBase is RocketMegapoolStorageLayout, RocketMegapoolDelegateBaseInterface {
    // Constants
    uint256 constant internal upgradeBuffer = 864000; // ~120 days

    // Immutables
    RocketStorageInterface immutable internal rocketStorage;
    uint256 immutable public version;

    constructor(RocketStorageInterface _rocketStorageAddress, uint256 _version) {
        version = _version;
        rocketStorage = _rocketStorageAddress;
    }

    /// @notice Called by an upgrade to begin the expiry countdown for this delegate
    /// @dev The expiration block can only ever be set to an offset from the current block to prevent malicious oDAO
    ///      from manually expiring a delegate and forcing node operators onto a new one without a delay
    function deprecate() external override onlyLatestNetworkContract {
        // Expiry is only used on the delegate contract itself
        require(!storageState);
        expirationBlock = block.number + upgradeBuffer;
    }

    /// @notice Returns the block at which this delegate expires (or 0 if not yet deprecated)
    function getExpirationBlock() external override view returns (uint256) {
        return expirationBlock;
    }

    //
    // Internals
    //

    /// @dev Get the address of a Rocket Pool network contract
    /// @param _contractName The internal name of the contract to retrieve the address for
    function getContractAddress(string memory _contractName) internal view returns (address) {
        address contractAddress = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", _contractName)));
        require(contractAddress != address(0x0), "Contract not found");
        return contractAddress;
    }

    //
    // Modifiers
    //

    /// @dev Reverts if caller is not the owner of the megapool
    modifier onlyMegapoolOwner() {
        require(isNodeCalling(msg.sender), "Not allowed");
        _;
    }

    /// @dev Reverts if called by any sender that doesn't match one of the supplied contract or is the latest version of that contract
    modifier onlyLatestContract(string memory _contractName, address _contractAddress) {
        require(_contractAddress == rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", _contractName))), "Invalid or outdated contract");
        _;
    }

    /// @dev Reverts if not called by a valid network contract
    modifier onlyLatestNetworkContract() {
        require(rocketStorage.getBool(keccak256(abi.encodePacked("contract.exists", msg.sender))), "Invalid or outdated network contract");
        _;
    }

    /// @dev Only allow access from node address or if RPL address is set, only from it
    modifier onlyRPLWithdrawalAddressOrNode() {
        // Check that the call is coming from RPL withdrawal address (or node if unset)
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        if (rocketNodeManager.getNodeRPLWithdrawalAddressIsSet(nodeAddress)) {
            address rplWithdrawalAddress = rocketNodeManager.getNodeRPLWithdrawalAddress(nodeAddress);
            require(msg.sender == rplWithdrawalAddress, "Not allowed");
        } else {
            require(msg.sender == nodeAddress, "Not allowed");
        }
        _;
    }

    /// @dev Returns true if msg.sender is node or node's withdrawal address
    function isNodeCalling(address _caller) internal view returns (bool) {
        if (_caller == nodeAddress) {
            return true;
        } else {
            address withdrawalAddress = rocketStorage.getNodeWithdrawalAddress(nodeAddress);
            if (_caller == withdrawalAddress) {
                return true;
            }
        }
        return false;
    }
}