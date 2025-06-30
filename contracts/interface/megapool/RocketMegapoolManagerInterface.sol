// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

import "../../contract/megapool/RocketMegapoolStorageLayout.sol";
import "./RocketMegapoolInterface.sol";
import {BeaconStateVerifierInterface, ValidatorProof, Withdrawal, WithdrawalProof} from "../util/BeaconStateVerifierInterface.sol";

interface RocketMegapoolManagerInterface {
    struct ExitChallenge {
        RocketMegapoolDelegateInterface megapool;
        uint32[] validatorIds;
    }

    function getValidatorCount() external view returns (uint256);
    function addValidator(address _megapoolAddress, uint32 _validatorId) external;
    function getLastChallenger() external view returns (address);
    function getValidatorInfo(uint256 _index) external view returns (bytes memory pubkey, RocketMegapoolStorageLayout.ValidatorInfo memory validatorInfo, address megapool, uint32 validatorId);
    function stake(RocketMegapoolInterface megapool, uint32 _validatorId, ValidatorProof calldata _proof) external;
    function dissolve(RocketMegapoolInterface megapool, uint32 _validatorId, ValidatorProof calldata _proof) external;
    function notifyExit(RocketMegapoolInterface megapool, uint32 _validatorId, ValidatorProof calldata _proof) external;
    function challengeExit(ExitChallenge[] calldata _challenges) external;
    function notifyNotExit(RocketMegapoolInterface _megapool, uint32 _validatorId, ValidatorProof calldata _proof) external;
    function notifyFinalBalance(RocketMegapoolInterface megapool, uint32 _validatorId, WithdrawalProof calldata _proof) external;
}