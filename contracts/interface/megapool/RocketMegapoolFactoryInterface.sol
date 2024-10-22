// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

interface RocketMegapoolFactoryInterface {
    function initialise() external;
    function getExpectedAddress(address _nodeAddress) external view returns (address);
    function getMegapoolDeployed(address _nodeAddress) external view returns (bool);
    function deployContract(address _nodeAddress) external returns (address);
    function getOrDeployContract(address _nodeAddress) external  returns (address);
    function upgradeDelegate(address _newDelegateAddress) external;
    function getDelegateExpiry(address _delegateAddress) external view returns (uint256);
}
