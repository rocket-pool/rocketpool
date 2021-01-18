pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "./RocketMinipoolDelegateInterface.sol";
import "../../types/MinipoolDeposit.sol";
import "../../types/MinipoolStatus.sol";

interface RocketMinipoolInterface is RocketMinipoolDelegateInterface {
    function getStatus() external view returns (MinipoolStatus);
    function getStatusBlock() external view returns (uint256);
    function getStatusTime() external view returns (uint256);
    function getDepositType() external view returns (MinipoolDeposit);
    function getNodeAddress() external view returns (address);
    function getNodeFee() external view returns (uint256);
    function getNodeDepositBalance() external view returns (uint256);
    function getNodeRefundBalance() external view returns (uint256);
    function getNodeDepositAssigned() external view returns (bool);
    function getUserDepositBalance() external view returns (uint256);
    function getUserDepositAssigned() external view returns (bool);
    function getUserDepositAssignedTime() external view returns (uint256);
    function getStakingStartBalance() external view returns (uint256);
    function getStakingEndBalance() external view returns (uint256);
}
