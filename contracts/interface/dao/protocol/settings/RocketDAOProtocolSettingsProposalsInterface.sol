pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAOProtocolSettingsProposalsInterface {
    function getVotePhase1Time() external view returns(uint256);
    function getVotePhase2Time() external view returns(uint256);
    function getVoteDelayTime() external view returns(uint256);
    function getExecuteTime() external view returns(uint256);
    function getProposalBond() external view returns(uint256);
    function getChallengeBond() external view returns(uint256);
    function getChallengePeriod() external view returns(uint256);
    function getProposalQuorum() external view returns (uint256);
    function getProposalVetoQuorum() external view returns (uint256);
    function getProposalMaxBlockAge() external view returns (uint256);
}
