pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

// An individual minipool in the Rocket Pool network

contract RocketMinipool {

    // Assign deposited ETH to the minipool and mark it as prelaunch
    // Only accepts calls from the RocketMinipoolStatus contract
    function assignDeposit() external payable {}

    // Progress the minipool to staking, sending its ETH deposit to the VRC
    // Only accepts calls from the RocketMinipoolStatus contract
    function stake(bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) external {}

    // Mark the minipool as exited
    // Only accepts calls from the RocketMinipoolStatus contract
    function exit() external {}

    // Mark the minipool as withdrawable and record its final balance
    // Only accepts calls from the RocketMinipoolStatus contract
    function withdraw(uint256 _withdrawalBalance) external {}

    // Withdraw rewards from the minipool and close it
    // Only accepts calls from the RocketMinipoolStatus contract
    function close() external {}

}
