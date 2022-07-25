pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only

import "../../types/MinipoolDeposit.sol";

interface RocketMinipoolQueueInterface {
    function getTotalLength() external view returns (uint256);
    function getLength(MinipoolDeposit _depositType) external view returns (uint256);
    function getTotalCapacity() external view returns (uint256);
    function getEffectiveCapacity() external view returns (uint256);
    function getNextCapacity() external view returns (uint256);
    function getNextDeposit() external view returns (MinipoolDeposit, uint256);
    function enqueueMinipool(MinipoolDeposit _depositType, address _minipool) external;
    function dequeueMinipool() external returns (address minipoolAddress);
    function dequeueMinipoolByDeposit(MinipoolDeposit _depositType) external returns (address minipoolAddress);
    function removeMinipool(MinipoolDeposit _depositType) external;
}
