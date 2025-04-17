pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAOProtocolSettingsNodeInterface {
    function getRegistrationEnabled() external view returns (bool);
    function getSmoothingPoolRegistrationEnabled() external view returns (bool);
    function getDepositEnabled() external view returns (bool);
    function getVacantMinipoolsEnabled() external view returns (bool);
    function getMinimumPerMinipoolStake() external view returns (uint256);
    function getMaximumPerMinipoolStake() external view returns (uint256);
    function getMaximumStakeForVotingPower() external view returns (uint256);
    function getReducedBond() external view returns (uint256);
    function getBaseBondArray() external view returns (uint256[] memory);
    function getUnstakingPeriod() external view returns (uint256);
}
