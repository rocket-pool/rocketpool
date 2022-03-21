pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketNetworkPricesInterface {
    function getPricesBlock() external view returns (uint256);
    function getGGPPrice() external view returns (uint256);
    function getEffectiveGGPStake() external view returns (uint256);
    function getEffectiveGGPStakeUpdatedBlock() external view returns (uint256);
    function getLatestReportableBlock() external view returns (uint256);
    function inConsensus() external view returns (bool);
    function submitPrices(uint256 _block, uint256 _ggpPrice, uint256 _effectiveGgpStake) external;
    function executeUpdatePrices(uint256 _block, uint256 _ggpPrice, uint256 _effectiveGgpStake) external;
    function increaseEffectiveGGPStake(uint256 _amount) external;
    function decreaseEffectiveGGPStake(uint256 _amount) external;
}
