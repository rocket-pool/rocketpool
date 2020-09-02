pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "./ERC20.sol";

interface RocketETHTokenInterface is ERC20 {
    function getEthValue(uint256 _rethAmount) external view returns (uint256);
    function getRethValue(uint256 _ethAmount) external view returns (uint256);
    function getExchangeRate() external view returns (uint256);
    function getTotalCollateral() external view returns (uint256);
    function getCollateralRate() external view returns (uint256);
    function depositRewards() external payable;
    function depositExcess() external payable;
    function mint(uint256 _ethAmount, address _to) external;
    function burn(uint256 _rethAmount) external;
}
