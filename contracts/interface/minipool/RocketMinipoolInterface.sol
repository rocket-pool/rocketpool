pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only

import "../../types/MinipoolDeposit.sol";
import "../../types/MinipoolStatus.sol";
import "../RocketStorageInterface.sol";

interface RocketMinipoolInterface {
    function version() external view returns (uint8);
    function initialise(address _nodeAddress) external;
    function getStatus() external view returns (MinipoolStatus);
    function getFinalised() external view returns (bool);
    function getStatusBlock() external view returns (uint256);
    function getStatusTime() external view returns (uint256);
    function getScrubVoted(address _member) external view returns (bool);
    function getDepositType() external view returns (MinipoolDeposit);
    function getNodeAddress() external view returns (address);
    function getNodeFee() external view returns (uint256);
    function getNodeDepositBalance() external view returns (uint256);
    function getNodeRefundBalance() external view returns (uint256);
    function getNodeDepositAssigned() external view returns (bool);
    function getPreLaunchValue() external view returns (uint256);
    function getNodeTopUpValue() external view returns (uint256);
    function getVacant() external view returns (bool);
    function getPreMigrationBalance() external view returns (uint256);
    function getUserDistributed() external view returns (bool);
    function getUserDepositBalance() external view returns (uint256);
    function getUserDepositAssigned() external view returns (bool);
    function getUserDepositAssignedTime() external view returns (uint256);
    function getTotalScrubVotes() external view returns (uint256);
    function calculateNodeShare(uint256 _balance) external view returns (uint256);
    function calculateUserShare(uint256 _balance) external view returns (uint256);
    function preDeposit(uint256 _bondingValue, bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) external payable;
    function deposit() external payable;
    function userDeposit() external payable;
    function distributeBalance(bool _rewardsOnly) external;
    function beginUserDistribute() external;
    function userDistributeAllowed() external view returns (bool);
    function refund() external;
    function slash() external;
    function finalise() external;
    function canStake() external view returns (bool);
    function canPromote() external view returns (bool);
    function stake(bytes calldata _validatorSignature, bytes32 _depositDataRoot) external;
    function prepareVacancy(uint256 _bondAmount, uint256 _currentBalance) external;
    function promote() external;
    function dissolve() external;
    function close() external;
    function voteScrub() external;
    function reduceBondAmount() external;
}
