pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketNetworkWithdrawalInterface {
    function getSystemWithdrawalContractAddress() external view returns (address);
    function setSystemWithdrawalContractAddress(address _value) external;
    function processWithdrawal() external payable;
}
