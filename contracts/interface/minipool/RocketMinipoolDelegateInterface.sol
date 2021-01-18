pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketMinipoolDelegateInterface {
    function nodeDeposit() external payable;
    function userDeposit() external payable;
    function refund() external;
    function stake(bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) external;
    function setWithdrawable(uint256 _stakingStartBalance, uint256 _stakingEndBalance) external;
    function withdraw() external;
    function dissolve() external;
    function close() external;
}
