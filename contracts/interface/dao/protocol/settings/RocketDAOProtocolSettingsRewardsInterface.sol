// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

interface RocketDAOProtocolSettingsRewardsInterface {
    function setSettingRewardsClaimers(uint256 _trustedNodePercent, uint256 _protocolPercent, uint256 _nodePercent) external;
    function getRewardsClaimerPerc(string memory _contractName) external view returns (uint256);
    function getRewardsClaimersPerc() external view returns (uint256 _trustedNodePercent, uint256 _protocolPercent, uint256 _nodePercent);
    function getRewardsClaimersTrustedNodePerc() external view returns (uint256);
    function getRewardsClaimersProtocolPerc() external view returns (uint256);
    function getRewardsClaimersNodePerc() external view returns (uint256);
    function getRewardsClaimersTimeUpdated() external view returns (uint256);
    function getRewardsClaimIntervalPeriods() external view returns (uint256);
    function getRewardsClaimIntervalTime() external view returns (uint256);
}
