pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketClaimDAOInterface {
    function getEnabled() external view returns (bool);
    function getSendRewardsPossible() external view returns (bool);
    function send() external;
}
