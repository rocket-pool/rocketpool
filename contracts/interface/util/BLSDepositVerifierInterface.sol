// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

interface BLSDepositVerifierInterface {
    function verifyDepositSignature(bytes calldata _pubkey, bytes32 _withdrawalCredentials, uint64 _amountGwei, bytes calldata _signature) external view returns (bool);
}
