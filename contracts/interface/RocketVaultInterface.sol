pragma solidity 0.6.10;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketVaultInterface {
	function balanceOf(address _contractAddress) external view returns (uint256);
    function depositEther() external payable;
    function withdrawEther(uint256 _amount) external;
}
