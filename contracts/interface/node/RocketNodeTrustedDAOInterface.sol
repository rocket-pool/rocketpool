pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketNodeTrustedDAOInterface {
    function getSettingQuorumThreshold() external view returns (uint256);
    function getSettingRPLBondSize() external view returns (uint256);
    function getMemberAt(uint256 _index) external view returns (address);
    function getMemberCount() external view returns (uint256);
    function getMemberCountMinRequired() external view returns (uint256);
    function getMemberCanMakeProposal(address _nodeAddress) external view returns (bool);
    function getMemberIsValid(address _nodeAddress) external view returns (bool);
    function getProposalTotal() external view returns (uint256);
    function getProposalProposer(uint256 _proposalID) external view returns (address);
    function getProposalExpires(uint256 _proposalID) external view returns (uint256);
    function getProposalCreated(uint256 _proposalID) external view returns (uint256);
    function getProposalVotesFor(uint256 _proposalID) external view returns (uint256);
    function getProposalVotesAgainst(uint256 _proposalID) external view returns (uint256);
    function getProposalCancelled(uint256 _proposalID) external view returns (bool);
    function getProposalExecuted(uint256 _proposalID) external view returns (bool);
    function getProposalExecutedExpired(uint256 _proposalID) external view returns (bool);
    function getProposalPayload(uint256 _proposalID) external view returns (bytes memory);
    function getProposalQuorumVotesRequired() external view returns (uint256);
    function getProposalReceiptHasVoted(uint256 _proposalID, address _nodeAddress) external view returns (bool);
    function getProposalReceiptSupported(uint256 _proposalID, address _nodeAddress) external view returns (bool);
    function proposalAdd(uint256 _proposalType, bytes memory _payload) external returns (bool);
    function proposalVote(uint256 _proposalID, bool _support) external; 
    function proposalCancel(uint256 _proposalID) external;
    function proposalExecute(uint256 _proposalID) external;
    function bootstrapMember(string memory _id, string memory _email, string memory _message, address _nodeAddress) external;
    function bootstrapSetting(string memory _settingPath, uint256 _value) external;
    function invite(string memory _id, string memory _email, string memory _message, address _nodeAddress) external returns (bool);
    function setting(string memory _settingPath, uint256 _value) external returns (bool);
    function rewardsRegister(bool _enable) external;
}
