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
    function assignDeposits() external;
    function maybeAssignOneDeposit() external;
    function maybeAssignDeposits() external returns (bool);
    function withdrawExcessBalance(uint256 _amount) external;
    function requestFunds(uint256 _bondAmount, uint256 _validatorIndex, uint256 _amount, bool _useExpressTicket) external;
    function exitQueue(uint256 validatorIndex, bool expressQueue) external;
    function withdrawCredit(uint256 _amount) external;
    function getQueueTop() external view returns (address receiver, bool assignmentPossible);
    function assignMegapools(uint256 _count) external;
}
