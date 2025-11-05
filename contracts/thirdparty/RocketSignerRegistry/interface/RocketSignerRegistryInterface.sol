// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.13;

interface RocketSignerRegistryInterface {
    function nodeToSigner(address) external view returns (address);
    function signerToNode(address) external view returns (address);
    function setSigner(address _signer, uint8 _v, bytes32 _r, bytes32 _s) external;
    function clearSigner() external;
}