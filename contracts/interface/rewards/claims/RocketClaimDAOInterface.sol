pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketClaimDAOInterface {
    function getEnabled() external view returns (bool);
    function getRewardsBalance() external view returns (uint256);
    function getRewardsSendPossible() external view returns (bool);
    function send() external;
}
