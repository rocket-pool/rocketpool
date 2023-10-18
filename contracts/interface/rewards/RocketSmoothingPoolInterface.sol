// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;
pragma abicoder v2;

interface RocketSmoothingPoolInterface {
    function withdrawEther(address _to, uint256 _amount) external;
}
