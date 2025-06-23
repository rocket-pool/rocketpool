// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

interface RocketDAOProtocolSettingsSecurityInterface {
    function getQuorum() external view returns (uint256);
    function getLeaveTime() external view returns (uint256);
    function getVoteTime() external view returns(uint256);
    function getExecuteTime() external view returns(uint256);
    function getActionTime() external view returns (uint256);
    function getUpgradeVetoQuorum() external view returns (uint256);
    function getUpgradeDelay() external view returns (uint256);
}
