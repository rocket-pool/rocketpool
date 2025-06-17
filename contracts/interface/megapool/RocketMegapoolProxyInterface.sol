// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

import "../../interface/RocketStorageInterface.sol";

interface RocketMegapoolProxyInterface {
    function initialise(address _nodeAddress) external;
    function delegateUpgrade() external;
    function setUseLatestDelegate(bool _state) external;
    function getUseLatestDelegate() external view returns (bool);
    function getDelegate() external view returns (address);
    function getEffectiveDelegate() external view returns (address);
    function getDelegateExpired() external view returns (bool);
}
