pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAONodeTrustedSettingsInterface {
    function setSettingUint(string memory _settingPath, uint256 _value) external;
    function getSettingUint(string memory _settingPath) external view returns(uint256);
    function getQuorum() external view returns(uint256);
    function getRPLBond() external view returns(uint256);
    function getMinipoolUnbondedMax() external view returns(uint256);
    function getProposalCooldown() external view returns(uint256);
    function getProposalVoteBlocks() external view returns(uint256);
    function getProposalVoteDelayBlocks() external view returns(uint256);
    function getProposalExecuteBlocks() external view returns(uint256);
    function getProposalActionBlocks() external view returns(uint256);
}
