pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAONodeTrustedInterface {
    function getMemberQuorumVotesRequired() external view returns (uint256);
    function getMemberAt(uint256 _index) external view returns (address);
    function getMemberCount() external view returns (uint256);
    function getMemberMinRequired() external view returns (uint256);
    function getMemberIsValid(address _nodeAddress) external view returns (bool);
    function getMemberLastProposalBlock(address _nodeAddress) external view returns (uint256);
    function getMemberID(address _nodeAddress) external view returns (string memory);
    function getMemberEmail(address _nodeAddress) external view returns (string memory);
    function getMemberJoinedBlock(address _nodeAddress) external view returns (uint256);
    function getMemberProposalExecutedBlock(string memory _proposalType, address _nodeAddress) external view returns (uint256);
    function getMemberReplacedAddress(string memory _type, address _nodeAddress) external view returns (address);
    function getMemberRPLBondAmount(address _nodeAddress) external view returns (uint256);
    function bootstrapMember(string memory _id, string memory _email, address _nodeAddress) external;
    function bootstrapSettingUint(string memory _settingPath, uint256 _value) external;
}
