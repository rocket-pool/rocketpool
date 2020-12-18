pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAONodeTrustedInterface {
    function getMemberAt(uint256 _index) external view returns (address);
    function getMemberCount() external view returns (uint256);
    function getMemberCountMinRequired() external view returns (uint256);
    function getMemberIsValid(address _nodeAddress) external view returns (bool);
    function getMemberLastProposalBlock(address _nodeAddress) external view returns (uint256);
    function getMemberID(address _nodeAddress) external view returns (string memory);
    function getMemberEmail(address _nodeAddress) external view returns (string memory);
    function bootstrapMember(string memory _id, string memory _email, address _nodeAddress) external;
    function bootstrapSettingUint(string memory _settingPath, uint256 _value) external;
    function propose(string memory _proposalMessage, bytes memory _payload) external returns (uint256);
    function vote(uint256 _proposalID, bool _support) external;
    function cancel(uint256 _proposalID) external;
    function proposalInvite(string memory _id, string memory _email, address _nodeAddress) external returns (bool);
    function proposalSetting(string memory _settingPath, uint256 _value) external returns (bool);
    function memberJoin() external;
    function rewardsRegister(bool _enable) external;
}
