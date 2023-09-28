// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

interface RocketDAOSecurityInterface {
    function getMemberQuorumVotesRequired() external view returns (uint256);
    function getMemberIsValid(address _nodeAddress) external view returns (bool);
    function getMemberAt(uint256 _index) external view returns (address);
    function getMemberCount() external view returns (uint256);
    function getMemberID(address _nodeAddress) external view returns (string memory);
    function getMemberJoinedTime(address _nodeAddress) external view returns (uint256);
    function getMemberProposalExecutedTime(string memory _proposalType, address _nodeAddress) external view returns (uint256);
}
