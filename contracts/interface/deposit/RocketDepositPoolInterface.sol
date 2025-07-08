pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketDepositPoolInterface {
    function getBalance() external view returns (uint256);
    function getNodeBalance() external view returns (uint256);
    function getUserBalance() external view returns (int256);
    function getNodeCreditBalance(address _nodeAddress) external view returns (uint256);
    function getExcessBalance() external view returns (uint256);
    function deposit() external payable;
    function getMaximumDepositAmount() external view returns (uint256);
    function nodeDeposit(uint256 _totalAmount) external payable;
    function recycleDissolvedDeposit() external payable;
    function recycleExcessCollateral() external payable;
    function recycleLiquidatedStake() external payable;
    function maybeAssignDeposits(uint256 _max) external;
    function assignDeposits(uint256 _max) external;
    function withdrawExcessBalance(uint256 _amount) external;
    function requestFunds(uint256 _bondAmount, uint32 _validatorId, uint256 _amount, bool _useExpressTicket) external;
    function exitQueue(address _nodeAddress, uint32 _validatorId, bool _expressQueue) external;
    function applyCredit(address _nodeAddress, uint256 _amount) external;
    function reduceBond(address _nodeAddress, uint256 _amount) external;
    function fundsReturned(address _nodeAddress, uint256 _nodeAmount, uint256 _userAmount) external;
    function withdrawCredit(uint256 _amount) external;
    function getQueueTop() external view returns (address receiver, bool assignmentPossible, uint256 headMovedBlock);
    function getQueueIndex() external view returns (uint256);
    function getMinipoolQueueLength() external view returns (uint256);
    function getExpressQueueLength() external view returns (uint256);
    function getStandardQueueLength() external view returns (uint256);
    function getTotalQueueLength() external view returns (uint256);
}
