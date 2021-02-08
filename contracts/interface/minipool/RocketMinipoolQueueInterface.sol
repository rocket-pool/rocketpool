pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../../types/MinipoolDeposit.sol";

interface RocketMinipoolQueueInterface {
    function getTotalLength() external view returns (uint256);
    function getLength(MinipoolDeposit _depositType) external view returns (uint256);
    function getTotalCapacity() external view returns (uint256);
    function getEffectiveCapacity() external view returns (uint256);
    function getNextCapacity() external view returns (uint256);
    function enqueueMinipool(MinipoolDeposit _depositType, address _minipool) external;
    function dequeueMinipool() external returns (address minipoolAddress);
    function removeMinipool() external;
}
