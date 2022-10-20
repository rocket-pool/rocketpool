// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.7.6;

import "../RocketBase.sol";
import "./RocketMinipoolStorageLayout.sol";

/// @notice All calls to this contract are delegated to the rocketMinipool contract that existed at time of deployment
contract RocketMinipoolProxy is RocketMinipoolStorageLayout {
    address immutable rocketMinipoolBase;

    constructor(address _rocketStorage) {
        rocketStorage = RocketStorageInterface(_rocketStorage);

        // Burn in the critical minipool logic
        rocketMinipoolBase = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", "rocketMinipoolBase")));
    }

    /// @notice Delegates all calls to locally stored version of rocketMinipoolBase
    fallback() external payable {
        address _target = rocketMinipoolBase;
        assembly {
            calldatacopy(0x0, 0x0, calldatasize())
            let result := delegatecall(gas(), _target, 0x0, calldatasize(), 0x0, 0)
            returndatacopy(0x0, 0x0, returndatasize())
            switch result case 0 {revert(0, returndatasize())} default {return (0, returndatasize())}
        }
    }
}
