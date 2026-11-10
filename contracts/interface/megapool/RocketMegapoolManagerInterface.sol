// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

import "../../contract/megapool/RocketMegapoolStorageLayout.sol";
import "./RocketMegapoolInterface.sol";

interface RocketMegapoolManagerInterface {
    struct ExitChallenge {
        RocketMegapoolDelegateInterface megapool;
        uint32[] validatorIds;
    }

    function getValidatorCount() external view returns (uint256);
    function addValidator(address _megapoolAddress, uint32 _validatorId, bytes calldata _pubkey) external;
    function getLastChallenger() external view returns (address);
    function getValidatorInfo(uint256 _index) external view returns (bytes memory pubkey, RocketMegapoolStorageLayout.ValidatorInfo memory validatorInfo, address megapool, uint32 validatorId);
    function getValidatorPrestakeInfo(uint256 _index) external view returns (bytes memory pubkey, RocketMegapoolStorageLayout.ValidatorInfo memory validatorInfo, address megapool, uint32 validatorId, bytes memory signature, uint256 challengeDeadline);
    function getPrestakedValidatorIndices(uint256 _offset, uint256 _limit) external view returns (uint256[] memory indices, uint256 nextIndex, uint256[] memory failedIndices);

    function challengeExit(ExitChallenge[] calldata _challenges) external;
    function challengeInvalidSignature(RocketMegapoolInterface _megapool, uint32 _validatorId) external;

    // Versioned proof entrypoints
    function stake(RocketMegapoolInterface _megapool, uint32 _validatorId, uint64 _slotTimestamp, uint256 _proofVersion, bytes calldata _proofData) external;
    function dissolve(RocketMegapoolInterface _megapool, uint32 _validatorId, uint64 _slotTimestamp, uint256 _proofVersion, bytes calldata _proofData) external;
    function dissolvePendingDeposit(RocketMegapoolInterface _megapool, uint32 _validatorId, uint64 _slotTimestamp, uint256 _proofVersion, bytes calldata _proofData) external;
    function notifyExit(RocketMegapoolInterface _megapool, uint32 _validatorId, uint64 _slotTimestamp, uint256 _proofVersion, bytes calldata _proofData) external;
    function notifyNotExit(RocketMegapoolInterface _megapool, uint32 _validatorId, uint64 _slotTimestamp, uint256 _proofVersion, bytes calldata _proofData) external;
    function notifyFinalBalance(RocketMegapoolInterface _megapool, uint32 _validatorId, uint64 _slotTimestamp, uint256 _proofVersion, bytes calldata _proofData) external;
}
