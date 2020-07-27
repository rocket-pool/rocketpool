pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketNodeSettingsInterface {
    function getRegistrationEnabled() external view returns (bool);
    function getDepositEnabled() external view returns (bool);
}
