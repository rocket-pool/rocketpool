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
    function bootstrapSettingClaimer(string memory _contractName, uint256 _perc) external;
    function bootstrapSpendTreasury(string memory _invoiceID, address _recipientAddress, uint256 _amount) external;
    function bootstrapDisable(bool _confirmDisableBootstrapMode) external;
}
