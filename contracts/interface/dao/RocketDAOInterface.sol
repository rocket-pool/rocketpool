pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAOInterface {
    function getSetting(string memory _settingPath) external view returns (uint256);
    function getProposalQuorumVotesRequired() external view returns (uint256);
}
