pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

// Helper contract to simulate malicious node withdrawal address
contract RevertOnTransfer {
    fallback() external payable {
        revert();
    }
}