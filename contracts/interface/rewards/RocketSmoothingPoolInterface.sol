pragma solidity 0.7.6;
pragma abicoder v2;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketSmoothingPoolInterface {
    function withdrawEther(address _to, uint256 _amount) external;
}
