// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

import {ValidatorProof, SlotProof} from "../util/BeaconStateVerifierInterface.sol";

interface RocketNetworkExitInterface {
    function getRequestedEth() external view returns (uint256);
    function getMinipoolCooperativeExitStart(address _minipoolAddress) external view returns (uint256);
    function getMegapoolCooperativeExitStart(address _megapoolAddress, uint32 _validatorId) external view returns (uint256);
    function getMinipoolLastExit(address _minipoolAddress) external view returns (uint256);
    function requestMinipoolExit(address _minipoolAddress) external;
    function forceMinipoolExit(address _minipoolAddress) external;
    function forceMegapoolExit(address _megapoolAddress, uint32 _validatorId) external;
    function penaliseMinipool(address _minipoolAddress, uint64 _slotTimestamp, ValidatorProof calldata _validatorProof, SlotProof calldata _slotProof) external;
    function requestMegapoolExit(address _megapoolAddress, uint32 _validatorId) external;
}