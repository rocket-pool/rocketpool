pragma solidity 0.6.9;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketNetworkWithdrawalInterface {
    function getBalance() external view returns (uint256);
    function getWithdrawalCredentials() external view returns (bytes memory);
    function depositWithdrawal() external payable;
}
