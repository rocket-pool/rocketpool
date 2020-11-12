pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketRewardsClaimTrustedNodeInterface {
    function getClaimIntervalTrustedNodeTotal() external view returns (uint256);
    function getClaimPossible(address _trustedNodeAddress) external view returns (bool);
    function getClaimRewardsPerc(address _trustedNodeAddress) external view returns (uint256);
    function getClaimRewardsAmount() external view returns (uint256);
    function claim() external;
}
