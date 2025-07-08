// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

struct RewardSubmission {
    uint256 rewardIndex;                // Index of the reward submission
    uint256 executionBlock;             // Execution block at which the calculations were made
    uint256 consensusBlock;             // Consensus block containing the execution block
    bytes32 merkleRoot;                 // Merkle root of the reward claims
    uint256 intervalsPassed;            // Number of intervals passed since last submission (usually 1)
    uint256 smoothingPoolETH;           // Balance to extract from smoothing pool to fulfil this reward interval

    uint256 treasuryRPL;                // How much RPL is to be sent to the pDAO treasury
    uint256 treasuryETH;                // Amount of ETH to send to pDAO treasury

    uint256 userETH;                    // Amount to send to rETH

    uint256[] trustedNodeRPL;           // Mapping of RPL rewards for oDAO members on each network
    uint256[] nodeRPL;                  // Mapping of RPL rewards for nodes on each network
    uint256[] nodeETH;                  // Mapping of ETH rewards for nodes on each network
}
