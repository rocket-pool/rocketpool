pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only

import "./MinipoolDeposit.sol";
import "./MinipoolStatus.sol";

// A struct containing all the information on-chain about a specific minipool

struct MinipoolDetails {
    bool exists;
    address minipoolAddress;
    bytes pubkey;
    MinipoolStatus status;
    uint256 statusBlock;
    uint256 statusTime;
    bool finalised;
    MinipoolDeposit depositType;
    uint256 nodeFee;
    uint256 nodeDepositBalance;
    bool nodeDepositAssigned;
    uint256 userDepositBalance;
    bool userDepositAssigned;
    uint256 userDepositAssignedTime;
    bool useLatestDelegate;
    address delegate;
    address previousDelegate;
    address effectiveDelegate;
    uint256 penaltyCount;
    uint256 penaltyRate;
    address nodeAddress;
}
