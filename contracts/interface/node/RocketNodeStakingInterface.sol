pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketNodeStakingInterface {
    function getTotalGGPStake() external view returns (uint256);
    function getNodeGGPStake(address _nodeAddress) external view returns (uint256);
    function getNodeGGPStakedTime(address _nodeAddress) external view returns (uint256);
    function getTotalEffectiveGGPStake() external view returns (uint256);
    function calculateTotalEffectiveGGPStake(uint256 offset, uint256 limit, uint256 ggpPrice) external view returns (uint256);
    function getNodeEffectiveGGPStake(address _nodeAddress) external view returns (uint256);
    function getNodeMinimumGGPStake(address _nodeAddress) external view returns (uint256);
    function getNodeMaximumGGPStake(address _nodeAddress) external view returns (uint256);
    function getNodeMinipoolLimit(address _nodeAddress) external view returns (uint256);
    function stakeGGP(uint256 _amount) external;
    function withdrawGGP(uint256 _amount) external;
    function slashGGP(address _nodeAddress, uint256 _ethSlashAmount) external;
}
