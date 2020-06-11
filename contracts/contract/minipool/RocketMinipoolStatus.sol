pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolStatusInterface.sol";
import "../../interface/util/AddressSetStorageInterface.sol";

// Handles updates to minipool status by trusted (oracle) nodes

contract RocketMinipoolStatus is RocketBase, RocketMinipoolStatusInterface {

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Mark a minipool as exited
    // Only accepts calls from trusted (oracle) nodes
    function exitMinipool(address _minipool) external onlyTrustedNode(msg.sender) {
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipool);
        minipool.exit();
    }

    // Mark a minipool as withdrawable and record its final balance
    // Only accepts calls from trusted (oracle) nodes
    function withdrawMinipool(address _minipool, uint256 _withdrawalBalance) external onlyTrustedNode(msg.sender) {
        // 1. Calculate the share of the validator balance for the node operator
        // 2. Mint nETH equal to the node operator's share to the minipool contract
        // 3. Mark the minipool as withdrawable
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipool);
        minipool.withdraw(_withdrawalBalance);
    }

}
