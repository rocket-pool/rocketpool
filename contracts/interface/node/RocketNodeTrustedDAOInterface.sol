pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketNodeTrustedDAOInterface {
    function join() external returns (bool);
    function rewardsRegister(bool _enable) external;
}
