pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketClaimDAOInterfaceOld {
    function spend(string memory _invoiceID, address _recipientAddress, uint256 _amount) external;
}