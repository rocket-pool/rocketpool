pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";

// Handles updates to minipool status
// Includes status updates initiated by RP network contracts, the minipool owner, and trusted (oracle) nodes

contract RocketMinipoolStatus is RocketBase {

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Assign deposited ETH to a minipool and mark it as prelaunch
    // Only accepts calls from the RocketDepositPool contract
    function assignMinipoolDeposit(address _minipool) external payable onlyLatestContract("rocketDepositPool", msg.sender) {}

    // Progress a minipool to staking, sending its ETH deposit to the VRC
    // Only accepts calls from the registered owner (node) of the minipool
    function stakeMinipool(address _minipool, bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) external {}

    // Mark a minipool as exited
    // Only accepts calls from trusted (oracle) nodes
    function exitMinipool(address _minipool) external onlyTrustedNode(msg.sender) {}

    // Mark a minipool as withdrawable and record its final balance
    // Only accepts calls from trusted (oracle) nodes
    function withdrawMinipool(address _minipool, uint256 _withdrawalBalance) external onlyTrustedNode(msg.sender) {
        // 1. Calculate the share of the validator balance for the node operator
        // 2. Mint nETH equal to the node operator's share to the minipool contract
        // 3. Mark the minipool as withdrawable
    }

    // Withdraw rewards from a minipool and close it
    // Only accepts calls from the registered owner (node) of the minipool
    function closeMinipool(address _minipool) external {}

}
