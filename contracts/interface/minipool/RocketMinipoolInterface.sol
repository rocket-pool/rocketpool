pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketMinipoolInterface {
    function nodeDeposit() external payable;
    function userDeposit() external payable;
    function stake(bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) external;
    function exit() external;
    function withdraw(uint256 _withdrawalBalance) external;
    function close() external;
    function dissolve() external;
}
