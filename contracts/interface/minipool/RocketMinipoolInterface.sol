pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../../types/MinipoolDeposit.sol";
import "../../types/MinipoolStatus.sol";
import "../RocketStorageInterface.sol";

interface RocketMinipoolInterface {
    function initialise(address _nodeAddress, MinipoolDeposit _depositType) external;
    function getStatus() external view returns (MinipoolStatus);
    function getNodeId() external view returns ( string memory );
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
    function getUserDepositBalance() external view returns (uint256);
    function getUserDepositAssigned() external view returns (bool);
    function getUserDepositAssignedTime() external view returns (uint256);
    function getTotalScrubVotes() external view returns (uint256);
    function calculateNodeShare(uint256 _balance) external view returns (uint256);
    function calculateUserShare(uint256 _balance) external view returns (uint256);
    function nodeDeposit(bytes calldata _validatorPubkey, string memory nodeId) external payable;
    function userDeposit() external payable;
    function distributeBalance() external;
    function distributeBalanceAndFinalise() external;
    function refund() external;
    function slash() external;
    function finalise() external;
    function canStake() external view returns (bool);
    function stake() external;
    function setWithdrawable() external;
    function dissolve() external;
    function close() external;
    function voteScrub() external;
}
