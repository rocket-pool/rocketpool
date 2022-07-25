pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketClaimTrustedNodeInterface {
    function getEnabled() external view returns (bool);
    function getClaimPossible(address _trustedNodeAddress) external view returns (bool);
    function getClaimRewardsPerc(address _trustedNodeAddress) external view returns (uint256);
    function getClaimRewardsAmount(address _trustedNodeAddress) external view returns (uint256);
    function register(address _trustedNode, bool _enable) external;
    function claim() external;
}
