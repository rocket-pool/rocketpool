pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only

import "../../types/MinipoolDeposit.sol";

interface RocketMinipoolQueueInterface {
    function getTotalLength() external view returns (uint256);
    function getContainsLegacy() external view returns (bool);
    function getLengthLegacy(MinipoolDeposit _depositType) external view returns (uint256);
    function getLength() external view returns (uint256);
    function getTotalCapacity() external view returns (uint256);
    function getEffectiveCapacity() external view returns (uint256);
    function getNextCapacityLegacy() external view returns (uint256);
    function getNextDepositLegacy() external view returns (MinipoolDeposit, uint256);
    function enqueueMinipool(address _minipool) external;
    function dequeueMinipoolByDepositLegacy(MinipoolDeposit _depositType) external returns (address minipoolAddress);
    function dequeueMinipools(uint256 _maxToDequeue) external returns (address[] memory minipoolAddress);
    function removeMinipool(MinipoolDeposit _depositType) external;
    function getMinipoolAt(uint256 _index) external view returns(address);
    function getMinipoolPosition(address _minipool) external view returns (int256);
}
