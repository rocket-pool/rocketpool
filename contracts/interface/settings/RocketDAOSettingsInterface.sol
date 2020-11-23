pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAOSettingsInterface {
    function getRewardsDAOAddress() external view returns (address);
    function getRewardsClaimerPerc(string memory _contractName) external view returns (uint256);
    function getRewardsClaimerPercBlockUpdated(string memory _contractName) external view returns (uint256);
    function getRewardsClaimersPercTotal() external view returns (uint256);
    function getRewardsClaimIntervalBlocks() external view returns (uint256);
    function getInflationIntervalRate() external view returns (uint256);
    function getInflationIntervalBlocks() external view returns (uint256);
    function getInflationIntervalStartBlock() external view returns (uint256);
}
