pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAONodeTrustedSettingsMinipoolInterface {
    function getScrubPeriod() external view returns(uint256);
    function getScrubQuorum() external view returns(uint256);
    function getScrubPenaltyEnabled() external view returns(bool);
}