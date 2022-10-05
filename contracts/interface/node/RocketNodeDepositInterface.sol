pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only

import "../../types/MinipoolDeposit.sol";

interface RocketNodeDepositInterface {
    function increaseDepositCreditBalance(address _nodeOperator, uint256 _amount) external;
    function deposit(uint256 _depositAmount, uint256 _minimumNodeFee, bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot, uint256 _salt, address _expectedMinipoolAddress) external payable;
    function isValidDepositAmount(uint256 _amount) external pure returns (bool);
    function getDepositAmounts() external pure returns (uint256[] memory);
}
