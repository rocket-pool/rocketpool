// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {Strings} from "@openzeppelin4/contracts/utils/Strings.sol";
import {RocketSignerRegistryInterface} from "./interface/RocketSignerRegistryInterface.sol";

/// @notice Maintains a one-to-one forward and reverse mapping of addresses to their delegated signer
contract RocketSignerRegistry is RocketSignerRegistryInterface {
    mapping(address => address) public nodeToSigner;
    mapping(address => address) public signerToNode;

    event SignerSet(address indexed nodeAddress, address signerAddress);

    /// @notice Sets a signing delegate for the caller
    /// @param _signer The address to which off-chain voting is delegated to for the caller
    /// @param _v v component of signature giving node permission to use the given signer
    /// @param _r r component of signature giving node permission to use the given signer
    /// @param _s s component of signature giving node permission to use the given signer
    function setSigner(address _signer, uint8 _v, bytes32 _r, bytes32 _s) external {
        require(msg.sender != _signer, "Cannot set to self");
        require(signerToNode[_signer] == address(0), "Signer address already in use");
        require(_signer != address(0), "Invalid signer");
        require(recoverSigner(msg.sender, _v, _r, _s) == _signer, "Invalid signature");
        // Clear existing reverse mapping
        address previousSigner = nodeToSigner[msg.sender];
        if (previousSigner != address(0)) {
            delete signerToNode[previousSigner];
        }
        // Store new mapping
        signerToNode[_signer] = msg.sender;
        nodeToSigner[msg.sender] = _signer;
        // Emit event
        emit SignerSet(msg.sender, _signer);
    }

    /// @notice Clears the signing delegate for the caller
    function clearSigner() external {
        // Clear existing reverse mapping
        address previousSigner = nodeToSigner[msg.sender];
        require (previousSigner != address(0), "No signer set");
        // Clear mappings
        delete signerToNode[previousSigner];
        delete nodeToSigner[msg.sender];
        // Emit event
        emit SignerSet(msg.sender, address(0));
    }

    /// @dev Recovers the address which signed a payload including the given node's address
    function recoverSigner(address _node, uint8 _v, bytes32 _r, bytes32 _s) internal pure returns(address) {
        bytes memory message = abi.encodePacked(Strings.toHexString(_node), " may delegate to me for Rocket Pool governance");
        bytes memory prefixedMessage = abi.encodePacked("\x19Ethereum Signed Message:\n", Strings.toString(message.length), message);
        bytes32 prefixedHash = keccak256(prefixedMessage);
        return ecrecover(prefixedHash, _v, _r, _s);
    }
}