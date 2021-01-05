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
    function propose(string memory _proposalMessage, bytes memory _payload) external returns (uint256);
    function vote(uint256 _proposalID, bool _support) external;
    function cancel(uint256 _proposalID) external;
    function proposalInvite(string memory _id, string memory _email, address _nodeAddress) external;
    function proposalLeave(address _nodeAddress) external;
    function proposalReplace(address _memberNodeAddress, string memory _replaceId, string memory _replaceEmail, address _replaceNodeAddress) external;
    function proposalSetting(string memory _settingPath, uint256 _value) external;
}
