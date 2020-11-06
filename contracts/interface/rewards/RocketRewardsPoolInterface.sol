pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketRewardsPoolInterface {
    function getClaimIntervalBlockStart() external view returns(uint256);
    function getClaimIntervalBlocks() external view returns(uint256);
    function getClaimBlockLastMade() external view returns(uint256);
    function getClaimIntervalsPassed() external view returns(uint256);
    function getClaimIntervalRewardsTotal() external view returns(uint256);
    function claimAmount(address _claimerAddress, uint256 _claimerAmount) external returns (uint256);
    function claim(address _claimerAddress, uint256 _claimerAmount) external;
}
