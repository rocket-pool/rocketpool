pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../../types/MinipoolDeposit.sol";

interface RocketNodeDepositInterface {
    function deposit(uint256 _minimumNodeFee, bytes calldata _validatorPubkey,  uint256 _salt, address _expectedMinipoolAddress, string memory nodeId) external payable;
    function getDepositType(uint256 _amount) external view returns (MinipoolDeposit);
}
