pragma solidity 0.6.9;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketVaultInterface {
    function depositEther() external payable;
    function withdrawEther(address _withdrawalAddress, uint256 _amount) external;
}
