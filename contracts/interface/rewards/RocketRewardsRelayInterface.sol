// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;
pragma abicoder v2;

struct Claim {
    uint256 rewardIndex;
    uint256 amountRPL;
    uint256 amountSmoothingPoolETH;
    uint256 amountVoterETH;
    bytes32[] merkleProof;
}

interface RocketRewardsRelayInterface {
    function relayRewards(uint256 _intervalIndex, bytes32 _merkleRoot, uint256 _rewardsRPL, uint256 _rewardsETH) external;
    function claim(address _nodeAddress, Claim[] calldata _claims) external;
    function claimAndStake(address _nodeAddress, Claim[] calldata _claims, uint256 _stakeAmount) external;
    function isClaimed(uint256 _intervalIndex, address _claimer) external view returns (bool);
}
