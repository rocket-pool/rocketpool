// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

interface RocketMegapoolFactoryInterface {
    function getExpectedAddress(address _nodeOperator) external view returns (address);
    function deployContract(address _nodeAddress) external returns (address);
    function upgradeDelegate(address _newDelegateAddress) external;
}
