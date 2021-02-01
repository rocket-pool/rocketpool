pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface RocketTokenNETHInterface is IERC20 {
    function depositRewards() external payable;
    function mint(uint256 _amount, address _to) external;
    function burn(uint256 _amount) external;
}
