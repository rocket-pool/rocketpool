// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

import {ValidatorProof, SlotProof} from "../util/BeaconStateVerifierInterface.sol";

interface RocketNetworkExitInterface {
    enum ExitType {
        None,
        Requested,
        Voluntary
    }

    function getRequestedEth() external view returns (uint256);
    function getVoluntaryEth() external view returns (uint256);
    function getExitFee() external view returns (uint256);
    function getMinipoolCooperativeExitStart(address _minipoolAddress) external view returns (uint256);
    function getMegapoolCooperativeExitStart(address _megapoolAddress, uint32 _validatorId) external view returns (uint256);
    function getMinipoolLastExit(address _minipoolAddress) external view returns (uint256);
    function getMinipoolExitRequestCount(address _minipoolAddress) external view returns (uint256);
    function getMinipoolExpectedUserCapital(address _minipoolAddress) external view returns (uint256);
    function getMegapoolExitType(address _megapoolAddress, uint32 _validatorId) external view returns (ExitType);
    function getMegapoolExpectedUserCapital(address _megapoolAddress, uint32 _validatorId) external view returns (uint256);
    function getMegapoolOutstandingExitCount(address _megapoolAddress) external view returns (uint256);
    function requestMinipoolExit(address _minipoolAddress) external;
    function forceMinipoolExit(address _minipoolAddress) external payable;
    function forceMegapoolExit(address _megapoolAddress, uint32 _validatorId) external payable;
    function retryMegapoolExit(address _megapoolAddress, uint32 _validatorId) external payable;
    function exitMegapoolValidators(address _megapoolAddress, uint32[] calldata _validatorIds) external payable;
    function penaliseMinipool(address _minipoolAddress, uint64 _slotTimestamp, ValidatorProof calldata _validatorProof, SlotProof calldata _slotProof) external payable;
    function requestMegapoolExit(address _megapoolAddress, uint32 _validatorId) external;
    function notifyMegapoolExit(address _megapoolAddress, uint32 _validatorId) external;
    function notifyMegapoolFinalBalance(address _megapoolAddress, uint32 _validatorId) external;
    function settleMinipoolExit(address _minipoolAddress) external;
}
