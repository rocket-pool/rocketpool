pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketRewardsPoolInterface {
    function getRPLBalance() external view returns(uint256);
    function getClaimIntervalBlockStart() external view returns(uint256);
    function getClaimIntervalBlockStartComputed() external view returns(uint256);
    function getClaimIntervalsPassed() external view returns(uint256);
    function getClaimIntervalBlocks() external view returns(uint256);
    function getClaimBlockLastMade() external view returns(uint256);
    function getClaimIntervalRewardsTotal() external view returns(uint256);
    function getClaimIntervalContractTotalRewards(string memory _claimingContract) external view returns(uint256);
    function getClaimIntervalContractPerc(string memory _claimingContract) external view returns(uint256);
    function getClaimIntervalContractTotalClaimed(string memory _claimingContract) external view returns(uint256);
    function getClaimIntervalContractTotalNext(string memory _claimingContract) external view returns(uint256);
    function getClaimIntervalContractTotalCurrent(string memory _claimingContract) external view returns(uint256);
    function getClaimIntervalHasClaimed(uint256 _claimIntervalStartBlock, string memory _claimingContract, address _claimerAddress) external view returns(bool);
    function getClaimAmount(string memory _claimingContract, address _claimerAddress, uint256 _claimerAmountPerc) external view returns (uint256);
    function getClaimContractRegisteredBlock(string memory _claimingContract, address _claimerAddress) external view returns(uint256);
    function getClaimContractRegisteredCanClaim(string memory _claimingContract, address _claimerAddress) external view returns(bool);
    function register(address _claimerAddress, bool _enabled) external;
    function claim(address _claimerAddress, uint256 _claimerAmount) external;
}
