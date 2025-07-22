// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

/// @dev Used to mock the "precompile" BeaconRoots contract
contract BeaconRootsMock {
    mapping(uint256 => bytes32) internal beaconRoots;

    constructor() {}

    function setParentBlockRoot(uint256 _timestamp, bytes32 _root) external {
        beaconRoots[_timestamp] = _root;
    }

    fallback(bytes calldata _input) external returns (bytes memory) {
        uint256 timestamp = abi.decode(_input, (uint256));
        if (beaconRoots[timestamp] != 0) {
            return abi.encode(beaconRoots[timestamp]);
        }
        revert();
    }
}