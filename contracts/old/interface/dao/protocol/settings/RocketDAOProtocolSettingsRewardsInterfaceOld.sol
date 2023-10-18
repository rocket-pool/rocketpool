pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAOProtocolSettingsRewardsInterfaceOld {
    function setSettingRewardsClaimer(string memory _contractName, uint256 _perc) external;
    function getRewardsClaimerPerc(string memory _contractName) external view returns (uint256);
    function getRewardsClaimerPercTimeUpdated(string memory _contractName) external view returns (uint256);
    function getRewardsClaimersPercTotal() external view returns (uint256);
    function getRewardsClaimIntervalTime() external view returns (uint256);
}