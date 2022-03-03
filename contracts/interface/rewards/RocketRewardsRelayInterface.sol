pragma solidity 0.7.6;
pragma abicoder v2;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketRewardsRelayInterface {
    function relayRewards(uint256 _index, bytes32 _merkleRoot, uint256 _rewards) external;
    function claim(uint256[] calldata _index, uint256[] calldata _amount, bytes32[][] calldata _merkleProof) external;
    function claimAndStake(uint256[] calldata _index, uint256[] calldata _amount, bytes32[][] calldata _merkleProof, uint256 _stakeAmount) external;
    function isClaimed(uint256 _index, address _claimer) external view returns (bool);
}
