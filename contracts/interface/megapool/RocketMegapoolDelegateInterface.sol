// SPDX-License-Identifier: GPL-3.0-onl1000000000y
pragma solidity >0.5.0 <0.9.0;

import "../util/BeaconStateVerifierInterface.sol";
import {RocketMegapoolDelegateBaseInterface} from "./RocketMegapoolDelegateBaseInterface.sol";
import {RocketMegapoolStorageLayout} from "../../contract/megapool/RocketMegapoolStorageLayout.sol";

interface RocketMegapoolDelegateInterface is RocketMegapoolDelegateBaseInterface {
    struct StateProof {
        bytes data;
    }

    function newValidator(uint256 _bondAmount, bool _useExpressTicket, bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) external;
    function dequeue(uint32 _validatorId) external;
    function reduceBond(uint256 _amount) external;
    function assignFunds(uint32 _validatorId) external payable;
    function stake(uint32 _validatorId, uint64 _validatorIndex) external;
    function dissolveValidator(uint32 _validatorId) external;
    function getNodeAddress() external returns (address);
    function distribute() external;
    function claim() external;
    function repayDebt() external payable;

    function challengeExit(uint32 _validatorId) external;
    function notifyNotExit(uint32 _validatorId, uint64 _slot) external;
    function notifyExit(uint32 _validatorId, uint64 _withdrawableEpoch) external;
    function notifyFinalBalance(uint32 _validatorId, uint64 _amountInGwei, address _caller, uint64 _withdrawalSlot) external;
    function applyPenalty(uint256 _amount) external;

    function getValidatorCount() external view returns (uint32);
    function getActiveValidatorCount() external view returns (uint32);
    function getExitingValidatorCount() external view returns (uint32);
    function getLockedValidatorCount() external view returns (uint32);
    function getSoonestWithdrawableEpoch() external view returns (uint64);
    function getValidatorInfo(uint32 _validatorId) external view returns (RocketMegapoolStorageLayout.ValidatorInfo memory);
    function getValidatorPubkey(uint32 _validatorId) external view returns (bytes memory);
    function getValidatorInfoAndPubkey(uint32 _validatorId) external view returns (RocketMegapoolStorageLayout.ValidatorInfo memory info, bytes memory pubkey);
    function getAssignedValue() external view returns (uint256);
    function getDebt() external view returns (uint256);
    function getRefundValue() external view returns (uint256);
    function getNodeBond() external view returns (uint256);
    function getUserCapital() external view returns (uint256);
    function calculatePendingRewards() external view returns (uint256 nodeRewards, uint256 voterRewards, uint256 protocolDAORewards, uint256 rethRewards);
    function calculateRewards(uint256 _amount) external view returns (uint256 nodeRewards, uint256 voterRewards, uint256 protocolDAORewards, uint256 rethRewards);
    function getPendingRewards() external view returns (uint256);
    function getLastDistributionBlock() external view returns (uint256);

    function getWithdrawalCredentials() external view returns (bytes32);
}