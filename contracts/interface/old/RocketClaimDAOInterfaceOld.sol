pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketClaimDAOInterfaceOld {
    function getEnabled() external view returns (bool);
    function spend(string memory _invoiceID, address _recipientAddress, uint256 _amount) external;
}