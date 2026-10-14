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

    function challengeExit(ExitChallenge[] calldata _challenges) external;

    // Versioned proof entrypoints
    function stake(RocketMegapoolInterface _megapool, uint32 _validatorId, uint64 _slotTimestamp, uint256 _proofVersion, bytes calldata _proofData) external;
    function dissolve(RocketMegapoolInterface _megapool, uint32 _validatorId, uint64 _slotTimestamp, uint256 _proofVersion, bytes calldata _proofData) external;
    function notifyExit(RocketMegapoolInterface _megapool, uint32 _validatorId, uint64 _slotTimestamp, uint256 _proofVersion, bytes calldata _proofData) external;
    function notifyNotExit(RocketMegapoolInterface _megapool, uint32 _validatorId, uint64 _slotTimestamp, uint256 _proofVersion, bytes calldata _proofData) external;
    function notifyFinalBalance(RocketMegapoolInterface _megapool, uint32 _validatorId, uint64 _slotTimestamp, uint256 _proofVersion, bytes calldata _proofData) external;
}
