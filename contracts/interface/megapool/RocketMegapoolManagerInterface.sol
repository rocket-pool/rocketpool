// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

import "../../contract/megapool/RocketMegapoolStorageLayout.sol";
import "./RocketMegapoolInterface.sol";
import {BeaconStateVerifierInterface, ValidatorProof, Withdrawal, WithdrawalProof, SlotProof} from "../util/BeaconStateVerifierInterface.sol";

interface RocketMegapoolManagerInterface {
    struct ExitChallenge {
        RocketMegapoolDelegateInterface megapool;
        uint32[] validatorIds;
    }

    function getValidatorCount() external view returns (uint256);
    function getMegapoolByPubkey(bytes calldata _pubkey) external view returns (address);
    function addValidator(address _megapoolAddress, uint32 _validatorId, bytes calldata _pubkey) external;
    function getLastChallenger() external view returns (address);
    function getValidatorInfo(uint256 _index) external view returns (bytes memory pubkey, RocketMegapoolStorageLayout.ValidatorInfo memory validatorInfo, address megapool, uint32 validatorId);
    function stake(RocketMegapoolInterface megapool, uint32 _validatorId, uint64 _slotTimestamp, ValidatorProof calldata _proof, SlotProof calldata _slotProof) external;
    function dissolve(RocketMegapoolInterface _megapool, uint32 _validatorId, uint64 _slotTimestamp, ValidatorProof calldata _proof, SlotProof calldata _slotProof) external;
    function notifyExit(RocketMegapoolInterface _megapool, uint32 _validatorId, uint64 _slotTimestamp, ValidatorProof calldata _proof, SlotProof calldata _slotProof) external;
    function challengeExit(ExitChallenge[] calldata _challenges) external;
    function notifyNotExit(RocketMegapoolInterface _megapool, uint32 _validatorId, uint64 _slotTimestamp, ValidatorProof calldata _proof, SlotProof calldata _slotProof) external;
    function notifyFinalBalance(RocketMegapoolInterface megapool, uint32 _validatorId, uint64 _slotTimestamp, WithdrawalProof calldata _proof, ValidatorProof calldata _validatorProof, SlotProof calldata _slotProof) external;
}