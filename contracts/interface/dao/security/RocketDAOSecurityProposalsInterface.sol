// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;
pragma abicoder v2;

import "../../../types/SettingType.sol";

interface RocketDAOSecurityProposalsInterface {
    function propose(string memory _proposalMessage, bytes memory _payload) external returns (uint256);
    function vote(uint256 _proposalID, bool _support) external;
    function cancel(uint256 _proposalID) external;
    function execute(uint256 _proposalID) external;

    function proposalSettingUint(string memory _settingContractName, string memory _settingPath, uint256 _value) external;
    function proposalSettingBool(string memory _settingContractName, string memory _settingPath, bool _value) external;
    function proposalSettingAddress(string memory _settingContractName, string memory _settingPath, address _value) external;

    function proposalInvite(string memory _id, address _memberAddress) external;
    function proposalKick(address _memberAddress) external;
    function proposalKickMulti(address[] calldata _memberAddresses) external;
    function proposalReplace(address _existingMemberAddress, string calldata _newMemberId, address _newMemberAddress) external;
}
