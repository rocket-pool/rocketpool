// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

import "@openzeppelin4/contracts/proxy/Clones.sol";

import "../RocketBase.sol";
import "../../interface/megapool/RocketMegapoolProxyInterface.sol";
import "../../interface/megapool/RocketMegapoolFactoryInterface.sol";
import "../../interface/megapool/RocketMegapoolDelegateBaseInterface.sol";

/// @notice Performs CREATE2 deployment of megapool contracts
contract RocketMegapoolFactory is RocketBase, RocketMegapoolFactoryInterface {

    // Libs
    using Clones for address;

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    /// @notice Returns the expected megapool address for a node operator
    function getExpectedAddress(address _nodeOperator) external override view returns (address) {
        // Ensure rocketMegapoolBase is setAddress
        address rocketMegapoolBase = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", "rocketMegapoolBase")));
        // Calculate node specific salt value
        bytes32 salt = keccak256(abi.encodePacked(_nodeOperator));
        // Return expected address
        return rocketMegapoolBase.predictDeterministicAddress(salt, address(this));
    }

    /// @notice Performs a CREATE2 deployment of a megapool contract
    /// @param _nodeAddress Owning node operator's address
    function deployContract(address _nodeAddress) override external onlyLatestContract("rocketMegapoolFactory", address(this)) onlyLatestNetworkContract() returns (address) {
        // Ensure rocketMegapoolBase is setAddress
        address rocketMegapoolBase = getAddress("rocketMegapoolBase");
        require(rocketMegapoolBase != address(0));
        // Construct final salt
        bytes32 salt = keccak256(abi.encodePacked(_nodeAddress));
        // Deploy the megapool
        address proxy = rocketMegapoolBase.cloneDeterministic(salt);
        // Initialise the megapool storage
        RocketMegapoolProxyInterface(proxy).initialise(_nodeAddress);
        // Return address
        return proxy;
    }

    /// @notice Called during an upgrade to publish a new delegate and deprecate any in-use ones
    function upgradeDelegate(address _newDelegateAddress) external onlyLatestContract("rocketMegapoolFactory", address(this)) onlyLatestNetworkContract() {
        /*
            A set of all past delegates is stored in RocketStorage as a dequeue with the following layout:

            Uint storage:
                keccak("megapool.delegate.set")    : struct Metadata { uint128 tail, uint128 head }
            Address storage:
                keccak("megapool.delegate.set") + 0: delegate 0
                             "                  + 1: delegate 1 <-- head (oldest unexpired delegate)
                             "                  + 2: delegate 2
                             "                  + 3: delegate 3 <-- tail (latest delegate)
        */
        // Compute storage keys
        uint256 setKey = uint256(keccak256(abi.encodePacked("megapool.delegate.set")));
        bytes32 metaKey = bytes32(setKey);
        // Retrieve set metadata
        uint256 meta = getUint(metaKey);
        uint128 head = uint128(meta);
        uint128 tail = uint128(meta >> 128);
        // Expiries should be sequential, but just in case we'll only advance the head if none before it have expired
        bool deprecatedOne = false;
        // Iterate over "in-use" delegates and deprecate them if they are yet to expire
        for (uint256 i = head; i < tail; i++) {
            RocketMegapoolDelegateBaseInterface deprecatedDelegate = RocketMegapoolDelegateBaseInterface(getAddress(bytes32(setKey + i)));
            uint256 expiry = deprecatedDelegate.getExpiryBlock();
            if (expiry == 0 || block.number < expiry) {
                // This delegate is still "in-use" so set the expiry block into the future
                deprecatedDelegate.deprecate();
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
