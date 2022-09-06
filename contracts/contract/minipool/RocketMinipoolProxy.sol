pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "./RocketMinipoolStorageLayout.sol";

contract RocketMinipoolProxy is RocketMinipoolStorageLayout {
    address immutable rocketMinipool;

    constructor(address _rocketStorage) {
        rocketStorage = RocketStorageInterface(_rocketStorage);

        // Burn in the critical minipool logic
        rocketMinipool = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", "rocketMinipool")));
    }

    // Delegates all transactions to the target supplied during creation
    fallback() external payable {
        address _target = rocketMinipool;
        assembly {
            calldatacopy(0x0, 0x0, calldatasize())
            let result := delegatecall(gas(), _target, 0x0, calldatasize(), 0x0, 0)
            returndatacopy(0x0, 0x0, returndatasize())
            switch result case 0 {revert(0, returndatasize())} default {return (0, returndatasize())}
        }
    }
}
