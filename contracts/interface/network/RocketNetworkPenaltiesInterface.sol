pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketNetworkPenaltiesInterface {
    function submitPenalty(address _minipoolAddress, uint256 _block) external;
    function executeUpdatePenalty(address _minipoolAddress, uint256 _block) external;
}
