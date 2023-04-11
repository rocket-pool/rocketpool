pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketNetworkPricesInterfaceOld {
    function getPricesBlock() external view returns (uint256);
    function getRPLPrice() external view returns (uint256);
    function getEffectiveRPLStake() external view returns (uint256);
    function getEffectiveRPLStakeUpdatedBlock() external view returns (uint256);
    function getLatestReportableBlock() external view returns (uint256);
    function inConsensus() external view returns (bool);
    function submitPrices(uint256 _block, uint256 _rplPrice, uint256 _effectiveRplStake) external;
    function executeUpdatePrices(uint256 _block, uint256 _rplPrice, uint256 _effectiveRplStake) external;
    function increaseEffectiveRPLStake(uint256 _amount) external;
    function decreaseEffectiveRPLStake(uint256 _amount) external;
}
