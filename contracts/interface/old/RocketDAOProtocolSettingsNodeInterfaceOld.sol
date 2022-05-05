pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDAOProtocolSettingsNodeInterfaceOld {
    function getRegistrationEnabled() external view returns (bool);
    function getDepositEnabled() external view returns (bool);
    function getMinimumPerMinipoolStake() external view returns (uint256);
    function getMaximumPerMinipoolStake() external view returns (uint256);
}
