// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

/// @dev Test-only EIP-4788 oracle. Never deployed as a protocol contract.
contract BlockRootsMock {
    mapping(uint256 => bytes32) private roots;

    function setBlockRoot(uint256 timestamp, bytes32 root) external {
        roots[timestamp] = root;
    }

    fallback(bytes calldata input) external returns (bytes memory) {
        bytes32 root = roots[abi.decode(input, (uint256))];
        require(root != bytes32(0), "Missing beacon root");
        return abi.encode(root);
    }
}
