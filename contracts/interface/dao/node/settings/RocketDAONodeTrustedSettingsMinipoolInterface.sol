pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAONodeTrustedSettingsMinipoolInterface {
    function getScrubPeriod() external view returns(uint256);
    function getScrubQuorum() external view returns(uint256);
    function getScrubPenaltyEnabled() external view returns(bool);
}
