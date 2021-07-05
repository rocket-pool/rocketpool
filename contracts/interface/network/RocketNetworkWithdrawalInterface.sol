pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketNetworkWithdrawalInterface {
    function processWithdrawal(bool _finalWithdraw) external payable;
}
