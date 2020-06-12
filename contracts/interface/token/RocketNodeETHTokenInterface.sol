pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "./ERC20.sol";

interface RocketNodeETHTokenInterface is ERC20 {
    function deposit() external payable;
    function mint(uint256 _amount, address _to) external;
}
