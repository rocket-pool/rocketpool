pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

struct RewardSubmission {
    uint256 rewardIndex;
    uint256 executionBlock;
    uint256 consensusBlock;
    bytes32 merkleRoot;
    string merkleTreeCID;
    uint256 intervalsPassed;
    uint256 treasuryRPL;
    uint256[] trustedNodeRPL;
    uint256[] nodeRPL;
    uint256[] nodeETH;
    uint256 userETH;
}
