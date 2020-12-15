pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAONodeTrustedInterface {
    function getSettingQuorumThreshold() external view returns (uint256);
    function getSettingRPLBondSize() external view returns (uint256);
    function getMemberAt(uint256 _index) external view returns (address);
    function getMemberCount() external view returns (uint256);
    function getMemberCountMinRequired() external view returns (uint256);
    function getMemberIsValid(address _nodeAddress) external view returns (bool);
    function bootstrapMember(string memory _id, string memory _email, string memory _message, address _nodeAddress) external;
    function bootstrapSetting(string memory _settingPath, uint256 _value) external;
    function invite(string memory _id, string memory _email, string memory _message, address _nodeAddress) external returns (bool);
    function setting(string memory _settingPath, uint256 _value) external returns (bool);
    function rewardsRegister(bool _enable) external;
}
