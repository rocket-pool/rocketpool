pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../../types/MinipoolDeposit.sol";
import "../../types/MinipoolStatus.sol";

interface RocketMinipoolInterface {
	function getStatus() external view returns (MinipoolStatus);
    function getStatusBlock() external view returns (uint256);
	function getDepositType() external view returns (MinipoolDeposit);
	function getNodeAddress() external view returns (address);
    function getNodeDepositBalance() external view returns (uint256);
    function getNodeDepositAssigned() external view returns (bool);
	function getUserDepositBalance() external view returns (uint256);
    function getUserDepositAssigned() external view returns (bool);
	function getStakingStartBalance() external view returns (uint256);
    function getStakingEndBalance() external view returns (uint256);
    function getStakingStartBlock() external view returns (uint256);
    function getStakingUserStartBlock() external view returns (uint256);
    function getStakingEndBlock() external view returns (uint256);
    function nodeDeposit() external payable;
    function userDeposit() external payable;
    function exit() external;
    function withdraw(uint256 _withdrawalBalance) external;
}
