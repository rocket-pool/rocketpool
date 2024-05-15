// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;
pragma abicoder v2;

import "../../../types/SettingType.sol";
import "./RocketDAOProtocolVerifierInterface.sol";

interface RocketDAOProtocolProposalInterface {
    // Possible states that a proposal may be in
    enum ProposalState {
        Pending,
        ActivePhase1,
        ActivePhase2,
        Destroyed,
        Vetoed,
        QuorumNotMet,
        Defeated,
        Succeeded,
        Expired,
        Executed
    }

    enum VoteDirection {
        NoVote,
        Abstain,
        For,
        Against,
        AgainstWithVeto
    }

    function getTotal() external view returns (uint256);
    function getProposer(uint256 _proposalID) external view returns (address);
    function getMessage(uint256 _proposalID) external view returns (string memory);
    function getStart(uint256 _proposalID) external view returns (uint256);
    function getPhase1End(uint256 _proposalID) external view returns (uint256);
    function getPhase2End(uint256 _proposalID) external view returns (uint256);
    function getExpires(uint256 _proposalID) external view returns (uint256);
    function getCreated(uint256 _proposalID) external view returns (uint256);
    function getVotingPowerFor(uint256 _proposalID) external view returns (uint256);
    function getVotingPowerAgainst(uint256 _proposalID) external view returns (uint256);
    function getVotingPowerVeto(uint256 _proposalID) external view returns (uint256);
    function getVotingPowerAbstained(uint256 _proposalID) external view returns (uint256);
    function getVotingPowerRequired(uint256 _proposalID) external view returns (uint256);
    function getDestroyed(uint256 _proposalID) external view returns (bool);
    function getFinalised(uint256 _proposalID) external view returns (bool);
    function getExecuted(uint256 _proposalID) external view returns (bool);
    function getVetoQuorum(uint256 _proposalID) external view returns (uint256);
    function getVetoed(uint256 _proposalID) external view returns (bool);
    function getPayload(uint256 _proposalID) external view returns (bytes memory);
    function getReceiptHasVoted(uint256 _proposalID, address _nodeAddress) external view returns (bool);
    function getReceiptHasVotedPhase1(uint256 _proposalID, address _nodeAddress) external view returns (bool);
    function getReceiptDirection(uint256 _proposalID, address _nodeAddress) external view returns (VoteDirection);
    function getState(uint256 _proposalID) external view returns (ProposalState);

    function getProposalBlock(uint256 _proposalID) external view returns (uint256);
    function getProposalVetoQuorum(uint256 _proposalID) external view returns (uint256);

    function propose(string memory _proposalMessage, bytes memory _payload, uint32 _blockNumber, Types.Node[] calldata _treeNodes) external returns (uint256);
    function vote(uint256 _proposalID, VoteDirection _vote, uint256 _votingPower, uint256 _nodeIndex, Types.Node[] calldata _witness) external;
    function overrideVote(uint256 _proposalID, VoteDirection _voteDirection) external;
    function finalise(uint256 _proposalID) external;
    function execute(uint256 _proposalID) external;
    function destroy(uint256 _proposalID) external;
}
