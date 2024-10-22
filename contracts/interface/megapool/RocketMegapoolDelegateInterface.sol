// SPDX-License-Identifier: GPL-3.0-only
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
    function assignFunds(uint32 _validatorId) external payable;
    function stake(uint32 _validatorId, bytes calldata _signature, bytes32 _depositDataRoot, ValidatorProof calldata _proof) external;
    function dissolveValidator(uint32 _validatorId) external;
    function getNodeAddress() external returns (address);

    function getValidatorCount() external view returns (uint256);
    function getValidatorInfo(uint32 _validatorId) external view returns (RocketMegapoolStorageLayout.ValidatorInfo memory);
    function getAssignedValue() external view returns (uint256);
    function getDebt() external view returns (uint256);
    function getRefundValue() external view returns (uint256);
    function getNodeCapital() external view returns (uint256);
    function getNodeBond() external view returns (uint256);
    function getUserCapital() external view returns (uint256);
    function getPendingRewards() external view returns (uint256);

    function getWithdrawalCredentials() external view returns (bytes32);
}