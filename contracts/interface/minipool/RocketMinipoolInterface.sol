pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../../types/MinipoolDeposit.sol";
import "../../types/MinipoolStatus.sol";

interface RocketMinipoolInterface {
    function getStatus() external view returns (MinipoolStatus);
    function getStatusBlock() external view returns (uint256);
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
    function getWithdrawalCredentials() external view returns (bytes memory);
    function nodeDeposit() external payable;
    function userDeposit() external payable;
    function payout(bool _confirmPayout) external;
    function refund() external;
    function stake(bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) external;
    function setWithdrawable(uint256 _stakingStartBalance, uint256 _stakingEndBalance) external;
    function dissolve() external;
    function close() external;
}
