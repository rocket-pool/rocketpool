pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketRewardsPoolInterface {
    function getRPLBalance() external view returns(uint256);
    function getClaimIntervalTimeStart() external view returns(uint256);
}
