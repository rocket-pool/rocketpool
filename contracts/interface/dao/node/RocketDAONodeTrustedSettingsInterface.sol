pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAONodeTrustedSettingsInterface {
    function setSettingUint(string memory _settingPath, uint256 _value) external;
    function getSettingUint(string memory _settingPath) external view returns(uint256);
    function getQuorum() external view returns(uint256);
    function getRPLBond() external view returns(uint256);
    function getMinipoolUnbondedMax() external view returns(uint256);
    function getCooldown() external view returns(uint256);
    function getVoteBlocks() external view returns(uint256);
    function getVoteDelayBlocks() external view returns(uint256);
    function getExecuteBlocks() external view returns(uint256);
    function getActionBlocks() external view returns(uint256);
}
