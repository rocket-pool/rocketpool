pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only

interface DepositInterface {
    function deposit(bytes calldata _pubkey, bytes calldata _withdrawalCredentials, bytes calldata _signature, bytes32 _depositDataRoot) external payable;
}
