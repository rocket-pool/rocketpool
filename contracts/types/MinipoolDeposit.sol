pragma solidity >0.5.0 <0.9.0;

// SPDX-License-Identifier: GPL-3.0-only

// Represents the type of deposits required by a minipool

enum MinipoolDeposit {
    None,       // Marks an invalid deposit type
    Full,       // The minipool requires 32 ETH from the node operator, 16 ETH of which will be refinanced from user deposits
    Half,       // The minipool required 16 ETH from the node operator to be matched with 16 ETH from user deposits
    Empty,      // The minipool requires 0 ETH from the node operator to be matched with 32 ETH from user deposits (trusted nodes only)
    Variable    // Indicates this minipool is of the new generation that supports a variable deposit amount
}
