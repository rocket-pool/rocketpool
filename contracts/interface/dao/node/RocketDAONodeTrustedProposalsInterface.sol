pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAONodeTrustedProposalsInterface {
    function propose(string memory _proposalMessage, bytes memory _payload) external returns (uint256);
    function vote(uint256 _proposalID, bool _support) external;
    function cancel(uint256 _proposalID) external;
    function execute(uint256 _proposalID) external;
    function proposalInvite(string memory _id, string memory _email, address _nodeAddress) external;
    function proposalLeave(address _nodeAddress) external;
    function proposalReplace(address _memberNodeAddress, string memory _replaceId, string memory _replaceEmail, address _replaceNodeAddress) external;
    function proposalKick(address _nodeAddress, uint256 _rplFine) external;
    function proposalSettingUint(string memory _settingContractName, string memory _settingPath, uint256 _value) external;
    function proposalSettingBool(string memory _settingContractName, string memory _settingPath, bool _value) external;
}
