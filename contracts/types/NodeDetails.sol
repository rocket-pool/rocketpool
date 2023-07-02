pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only

// A struct containing all the information on-chain about a specific node

struct NodeDetails {
    bool exists;
    uint256 registrationTime;
    string timezoneLocation;
    bool feeDistributorInitialised;
    address feeDistributorAddress;
    uint256 rewardNetwork;
    uint256 rplStake;
    uint256 effectiveRPLStake;
    uint256 minimumRPLStake;
    uint256 maximumRPLStake;
    uint256 ethMatched;
    uint256 ethMatchedLimit;
    uint256 minipoolCount;
    uint256 balanceETH;
    uint256 balanceRETH;
    uint256 balanceRPL;
    uint256 balanceOldRPL;
    uint256 depositCreditBalance;
    uint256 distributorBalanceUserETH;
    uint256 distributorBalanceNodeETH;
    address withdrawalAddress;
    address pendingWithdrawalAddress;
    bool smoothingPoolRegistrationState;
    uint256 smoothingPoolRegistrationChanged;
    address nodeAddress;
}
