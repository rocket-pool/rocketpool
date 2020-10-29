pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface RocketTokenRPLInterface is IERC20 {
    function getInflationCalcBlock() external view returns(uint256);
    function getInflationIntervalBlocks() external view returns(uint256);
    function getInflationIntervalRate() external view returns(uint256);
    function getInlfationIntervalsPassed() external view returns(uint256);
    function getInflationIntervalStartBlock() external view returns(uint256);
    function getInflationRewardsContractAddress() external view returns(address);
    function inflationCalculate() external view returns (uint256);
    function inflationMintTokens() external returns (uint256);
    function swapTokens(uint256 _amount) external;
}
