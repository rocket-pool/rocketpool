pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAOProposalInterface {

    // Possible states that a proposal may be in
    enum ProposalState {
        Pending,
        Active,
        Cancelled,
        Defeated,
        Succeeded,
        Expired,
        Executed
    }

    function getTotal() external view returns (uint256);
    function getDAO(uint256 _proposalID) external view returns (string memory);
    function getProposer(uint256 _proposalID) external view returns (address);
    function getMessage(uint256 _proposalID) external view returns (string memory);
    function getStart(uint256 _proposalID) external view returns (uint256);
    function getEnd(uint256 _proposalID) external view returns (uint256);
    function getExpires(uint256 _proposalID) external view returns (uint256);
    function getCreated(uint256 _proposalID) external view returns (uint256);
    function getVotesFor(uint256 _proposalID) external view returns (uint256);
    function getVotesAgainst(uint256 _proposalID) external view returns (uint256);
    function getVotesRequired(uint256 _proposalID) external view returns (uint256);
    function getCancelled(uint256 _proposalID) external view returns (bool);
    function getExecuted(uint256 _proposalID) external view returns (bool);
    function getPayload(uint256 _proposalID) external view returns (bytes memory);
    function getReceiptHasVoted(uint256 _proposalID, address _nodeAddress) external view returns (bool);
    function getReceiptSupported(uint256 _proposalID, address _nodeAddress) external view returns (bool);
    function getState(uint256 _proposalID) external view returns (ProposalState);
    function add(address _member, string memory _dao, string memory _message, uint256 _startBlock, uint256 _durationBlocks, uint256 _expiresBlocks, uint256 _votesRequired, bytes memory _payload) external returns (uint256);
    function vote(address _member, uint256 _votes, uint256 _proposalID, bool _support) external;
    function cancel(address _member, uint256 _proposalID) external;
    function execute(uint256 _proposalID) external;
    
}
