pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAONetworkInterface {
    function getBootstrapModeDisabled() external view returns (bool);
    function bootstrapSettingUint(string memory _settingContractName, string memory _settingPath, uint256 _value) external;
    function bootstrapSettingBool(string memory _settingContractName, string memory _settingPath, bool _value) external;
    function bootstrapSettingClaimer(string memory _contractName, uint256 _perc) external;
    function bootstrapDisable(bool _confirmDisableBootstrapMode) external;
}
