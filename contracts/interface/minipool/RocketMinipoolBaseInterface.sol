pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketMinipoolBaseInterface {
    function initialise(address _rocketStorage, address _nodeAddress) external;
    function delegateUpgrade() external;
    function delegateRollback() external;
    function setUseLatestDelegate(bool _setting) external;
    function getUseLatestDelegate() external view returns (bool);
    function getDelegate() external view returns (address);
    function getPreviousDelegate() external view returns (address);
    function getEffectiveDelegate() external view returns (address);
}
