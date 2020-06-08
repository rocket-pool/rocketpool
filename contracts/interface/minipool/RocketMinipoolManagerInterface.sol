pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketMinipoolManagerInterface {
    function createMinipool(address _nodeAddress, uint256 _nodeDepositAmount, bool _nodeTrusted) external returns (address);
    function destroyMinipool() external;
}
