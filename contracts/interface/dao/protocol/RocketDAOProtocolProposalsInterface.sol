// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;
pragma abicoder v2;

import "../../../types/SettingType.sol";

interface RocketDAOProtocolProposalsInterface {
    function proposalSettingMulti(string[] memory _settingContractNames, string[] memory _settingPaths, SettingType[] memory _types, bytes[] memory _data) external;
    function proposalSettingUint(string memory _settingContractName, string memory _settingPath, uint256 _value) external;
    function proposalSettingBool(string memory _settingContractName, string memory _settingPath, bool _value) external;
    function proposalSettingAddress(string memory _settingContractName, string memory _settingPath, address _value) external;
    function proposalSettingAddressList(string memory _settingContractName, string memory _settingPath, address[] calldata _value) external;
    function proposalSettingRewardsClaimers(uint256 _trustedNodePercent, uint256 _protocolPercent, uint256 _nodePercent) external;

    function proposalTreasuryOneTimeSpend(string memory _invoiceID, address _recipientAddress, uint256 _amount) external;
    function proposalTreasuryNewContract(string memory _contractName, address _recipientAddress, uint256 _amountPerPeriod, uint256 _periodLength, uint256 _startTime, uint256 _numPeriods) external;
    function proposalTreasuryUpdateContract(string memory _contractName, address _recipientAddress, uint256 _amountPerPeriod, uint256 _periodLength, uint256 _numPeriods) external;

    function proposalSecurityInvite(string memory _id, address _memberAddress) external;
    function proposalSecurityKick(address _memberAddress) external;
    function proposalSecurityKickMulti(address[] calldata _memberAddresses) external;
    function proposalSecurityReplace(address _existingMemberAddress, string calldata _id, address _newMemberAddress) external;
}
