pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface DepositInterface {
    function deposit(bytes calldata _pubkey, bytes calldata _withdrawalCredentials) external payable;
}
