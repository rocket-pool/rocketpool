pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAONodeTrustedSettingsMembersInterface {
    function getQuorum() external view returns (uint256);
    function getRPLBond() external view returns(uint256);
    function getMinipoolUnbondedMax() external view returns(uint256);
    function getMinipoolUnbondedMinFee() external view returns(uint256);
    function getChallengeCooldown() external view returns(uint256);
    function getChallengeWindow() external view returns(uint256);
    function getChallengeCost() external view returns(uint256);
}
