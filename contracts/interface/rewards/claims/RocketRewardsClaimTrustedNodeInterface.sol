pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketRewardsClaimTrustedNodeInterface {
    function getClaimAmount() view external returns (uint256);
    function claim() external;
}
