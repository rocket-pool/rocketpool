// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketMegapoolDelegateBaseInterface} from "../../interface/megapool/RocketMegapoolDelegateBaseInterface.sol";
import {RocketMegapoolFactoryInterface} from "../../interface/megapool/RocketMegapoolFactoryInterface.sol";
import {RocketMegapoolProxyInterface} from "../../interface/megapool/RocketMegapoolProxyInterface.sol";
import {RocketBase} from "../RocketBase.sol";
import {Clones} from "@openzeppelin4/contracts/proxy/Clones.sol";

/// @notice Performs deterministic deployment of megapool delegate contracts and handles deprecation of old ones
contract RocketMegapoolFactory is RocketBase, RocketMegapoolFactoryInterface {
    // Immutables
    uint256 private immutable setKey;

    // Libs
    using Clones for address;

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
        // Initialise immutables
        setKey = uint256(keccak256(abi.encodePacked("megapool.delegate.set")));
    }

    /// @notice Used following an upgrade or new deployment to initialise the delegate list
    function initialise() override public {
        // On new deploy, allow guardian to initialise, otherwise, only a network contract
        if (rocketStorage.getDeployedStatus()) {
            require(getBool(keccak256(abi.encodePacked("contract.exists", msg.sender))), "Invalid or outdated network contract");
        } else {
            require(msg.sender == rocketStorage.getGuardian(), "Not guardian");
        }
        // Prevent multiple initialisations by checking if the meta struct is non-zero
        bytes32 metaKey = bytes32(setKey);
        uint256 meta = getUint(metaKey);
        require(meta == 0, "Already initialised");
        // Initialise the delegate list
        _upgradeDelegate(getContractAddress("rocketMegapoolDelegate"));
    }

    /// @notice Returns the expected megapool address for a node operator
    /// @param _nodeAddress Address of the node operator to compute the megapool address for
    function getExpectedAddress(address _nodeAddress) override public view returns (address) {
        // Ensure rocketMegapoolBase is setAddress
        address rocketMegapoolProxy = getContractAddress("rocketMegapoolProxy");
        // Calculate node specific salt value
        bytes32 salt = keccak256(abi.encodePacked(_nodeAddress));
        // Return expected address
        return rocketMegapoolProxy.predictDeterministicAddress(salt, address(this));
    }

    /// @notice Returns true if the given node operator has deployed their megapool
    /// @param _nodeAddress Address of the node operator to query
    function getMegapoolDeployed(address _nodeAddress) override external view returns (bool) {
        address contractAddress = getExpectedAddress(_nodeAddress);
        return getBool(keccak256(abi.encodePacked("megapool.exists", contractAddress)));
    }

    /// @notice Deploys a megapool for the given node operator (only callable by other network contracts)
    /// @param _nodeAddress Owning node operator's address
    function deployContract(address _nodeAddress) override public onlyLatestNetworkContract onlyLatestContract("rocketMegapoolFactory", address(this)) returns (address) {
        // Ensure rocketMegapoolBase is setAddress
        address rocketMegapoolProxy = getContractAddress("rocketMegapoolProxy");
        require(rocketMegapoolProxy != address(0), "Invalid proxy");
        // Check if already deployed
        require(!getBool(keccak256(abi.encodePacked("megapool.exists", getExpectedAddress(_nodeAddress)))), "Megapool already deployed for node operator");
        // Construct final salt
        bytes32 salt = keccak256(abi.encodePacked(_nodeAddress));
        // Deploy the megapool
        address proxy = rocketMegapoolProxy.cloneDeterministic(salt);
        // Initialise the megapool storage
        RocketMegapoolProxyInterface(proxy).initialise(_nodeAddress);
        // Mark as valid megapool address
        setBool(keccak256(abi.encodePacked("megapool.exists", proxy)), true);
        // Return address
        return proxy;
    }

    /// @notice Returns megapool address for given node, deploys if it doesn't exist yet
    /// @param _nodeAddress Owning node operator's address
    function getOrDeployContract(address _nodeAddress) override external onlyLatestNetworkContract onlyLatestContract("rocketMegapoolFactory", address(this)) returns (address) {
        address contractAddress = getExpectedAddress(_nodeAddress);
        if (getBool(keccak256(abi.encodePacked("megapool.exists", contractAddress)))) {
            return contractAddress;
        }
        return deployContract(_nodeAddress);
    }

    /// @notice Returns the expiration block of the given delegate (or 0 if not deprecated yet)
    /// @param _delegateAddress Address of the delegate to query
    function getDelegateExpiry(address _delegateAddress) override external view returns (uint256) {
        RocketMegapoolDelegateBaseInterface deprecatedDelegate = RocketMegapoolDelegateBaseInterface(_delegateAddress);
        return deprecatedDelegate.getExpirationBlock();
    }

    /// @notice Called during an upgrade to publish a new delegate and deprecate any in-use ones
    /// @param _newDelegateAddress The address of the new delegate to upgrade to
    function upgradeDelegate(address _newDelegateAddress) override public onlyLatestContract("rocketMegapoolFactory", address(this)) onlyLatestNetworkContract() {
        _upgradeDelegate(_newDelegateAddress);
    }

    /// @dev Performs the deprecation of old delegates and insertion of the new one into the dequeue
    /// @param _newDelegateAddress The address of the new delegate to upgrade to
    function _upgradeDelegate(address _newDelegateAddress) internal {
        /*
            A set of all past delegates is stored in RocketStorage as a dequeue with the following layout:

            Uint storage:
                keccak("megapool.delegate.set")    : struct Metadata { uint128 tail, uint128 head }
            Address storage:
                keccak("megapool.delegate.set") + 0: delegate 0
                             "                  + 1: delegate 1 <-- head (oldest unexpired delegate)
                             "                  + 2: delegate 2
                             "                  + 3: delegate 3 (latest delegate)
                             "                  + 4: empty      <-- tail
        */
        // Compute storage keys
        bytes32 metaKey = bytes32(setKey);
        // Retrieve set metadata
        uint256 meta = getUint(metaKey);
        uint128 head = uint128(meta);
        uint128 tail = uint128(meta >> 128);
        // Expiry blocks should be sequential, but just in case we'll only advance the head if none before it have expired
        bool deprecatedOne = false;
        // Iterate over "in-use" delegates and deprecate them if they are yet to expire
        for (uint256 i = head; i < tail; ++i) {
            RocketMegapoolDelegateBaseInterface delegate = RocketMegapoolDelegateBaseInterface(getAddress(bytes32(setKey + i)));
            uint256 expiry = delegate.getExpirationBlock();
            if (expiry == 0 || block.number < expiry) {
                // This delegate is still "in-use" so set the expiry block into the future
                delegate.deprecate();
                deprecatedOne = true;
            } else if (!deprecatedOne) {
                // This delegate has already expired so no longer considered "in-use", advance the head
                head += 1;
            }
        }
        // Push new delegate address to set
        setAddress(bytes32(setKey + tail), _newDelegateAddress);
        tail += 1;
        // Update meta
        meta = (uint256(tail) << 128) | uint256(head);
        setUint(metaKey, meta);
        // Set the current delegate
        setAddress(keccak256(abi.encodePacked("contract.address", "rocketMegapoolDelegate")), _newDelegateAddress);
    }
}
