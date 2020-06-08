pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketMinipoolQueueInterface {
    function getTotalLength() external view returns (uint256);
	function getActiveLength() external view returns (uint256);
	function getIdleLength() external view returns (uint256);
	function getEmptyLength() external view returns (uint256);
	function getTotalCapacity() external view returns (uint256);
	function getNextCapacity() external view returns (uint256);
	function enqueueMinipool(address _minipool, uint256 _nodeDepositAmount) external;
	function dequeueMinipool() external returns (address);
	function removeActiveMinipool(address _minipool) external;
	function removeIdleMinipool(address _minipool) external;
	function removeEmptyMinipool(address _minipool) external;
}
