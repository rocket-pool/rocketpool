pragma solidity >0.5.0 <0.9.0;
pragma abicoder v2;

import "../../types/RewardSubmission.sol";

// SPDX-License-Identifier: GPL-3.0-only

interface RocketRewardsPoolInterface {
    function getEthBalance() external view returns (uint256);
    function getRewardIndex() external view returns(uint256);
    function getRPLBalance() external view returns(uint256);
    function getPendingRPLRewards() external view returns (uint256);
    function getPendingETHRewards() external view returns (uint256);
    function getPendingVoterShare() external view returns (uint256);
    function getClaimIntervalTimeStart() external view returns(uint256);
    function getClaimIntervalTime() external view returns(uint256);
    function getClaimIntervalsPassed() external view returns(uint256);
    function getClaimIntervalExecutionBlock(uint256 _interval) external view returns(uint256);
    function getClaimIntervalExecutionAddress(uint256 _interval) external view returns(address);
    function getClaimingContractPerc(string memory _claimingContract) external view returns(uint256);
    function getClaimingContractsPerc(string[] memory _claimingContracts) external view returns (uint256[] memory);
    function getTrustedNodeSubmitted(address _trustedNodeAddress, uint256 _rewardIndex) external view returns (bool);
    function getSubmissionFromNodeExists(address _trustedNodeAddress, RewardSubmission calldata _submission) external view returns (bool);
    function getSubmissionCount(RewardSubmission calldata _submission) external view returns (uint256);
    function submitRewardSnapshot(RewardSubmission calldata _submission) external;
    function executeRewardSnapshot(RewardSubmission calldata _submission) external;
    function depositVoterShare() payable external;
}
