pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAONodeTrustedSettingsMinipoolInterface {
    function getScrubPeriod() external view returns(uint256);
    function getPromotionScrubPeriod() external view returns(uint256);
    function getScrubQuorum() external view returns(uint256);
    function getCancelBondReductionQuorum() external view returns(uint256);
    function getScrubPenaltyEnabled() external view returns(bool);
    function isWithinBondReductionWindow(uint256 _time) external view returns (bool);
    function getBondReductionWindowStart() external view returns (uint256);
    function getBondReductionWindowLength() external view returns (uint256);
}
