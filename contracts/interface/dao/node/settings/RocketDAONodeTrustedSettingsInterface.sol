pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAONodeTrustedSettingsInterface {
    function getSettingUint(string memory _settingPath) external view returns (uint256);
    function setSettingUint(string memory _settingPath, uint256 _value) external;
    function getSettingBool(string memory _settingPath) external view returns (bool);
    function setSettingBool(string memory _settingPath, bool _value) external;
}
