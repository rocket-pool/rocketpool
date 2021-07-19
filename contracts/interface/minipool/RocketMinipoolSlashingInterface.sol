pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketMinipoolSlashingInterface {
    // Max slash rate
    function setMaxSlashRate(uint256 _rate) external;
    function getMaxSlashRate() external view returns (uint256);

    // Slash rate
    function setSlashRate(address _minipoolAddress, uint256 _rate) external;
    function getSlashRate(address _minipoolAddress) external view returns(uint256);
}
