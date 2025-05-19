pragma solidity >0.5.0 <0.9.0;
pragma abicoder v2;

import "../../../types/SettingType.sol";

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAOProtocolInterface {
    function getMemberLastProposalTime(address _nodeAddress) external view returns (uint256);
    function getBootstrapModeDisabled() external view returns (bool);
    function bootstrapSettingMulti(string[] memory _settingContractNames, string[] memory _settingPaths, SettingType[] memory _types, bytes[] memory _values) external;
    function bootstrapSettingUint(string memory _settingContractName, string memory _settingPath, uint256 _value) external;
    function bootstrapSettingBool(string memory _settingContractName, string memory _settingPath, bool _value) external;
    function bootstrapSettingAddress(string memory _settingContractName, string memory _settingPath, address _value) external;
    function bootstrapSettingAddressList(string memory _settingContractName, string memory _settingPath, address[] calldata _value) external;
    function bootstrapSettingClaimers(uint256 _trustedNodePerc, uint256 _protocolPerc, uint256 _nodePerc) external;
    function bootstrapSpendTreasury(string memory _invoiceID, address _recipientAddress, uint256 _amount) external;
    function bootstrapTreasuryNewContract(string memory _contractName, address _recipientAddress, uint256 _amountPerPeriod, uint256 _periodLength, uint256 _startTime, uint256 _numPeriods) external;
    function bootstrapTreasuryUpdateContract(string memory _contractName, address _recipientAddress, uint256 _amountPerPeriod, uint256 _periodLength, uint256 _numPeriods) external;
    function bootstrapSecurityInvite(string memory _id, address _memberAddress) external;
    function bootstrapSecurityKick(address _memberAddress) external;
    function bootstrapDisable(bool _confirmDisableBootstrapMode) external;
    function bootstrapEnableGovernance() external;
}
