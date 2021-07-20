pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

interface RocketRewardsPoolInterface {
    function getRPLBalance() external view returns(uint256);
    function getClaimIntervalTimeStart() external view returns(uint256);
    function getClaimIntervalTimeStartComputed() external view returns(uint256);
    function getClaimIntervalsPassed() external view returns(uint256);
    function getClaimIntervalTime() external view returns(uint256);
    function getClaimTimeLastMade() external view returns(uint256);
    function getClaimIntervalRewardsTotal() external view returns(uint256);
    function getClaimingContractTotalClaimed(string memory _claimingContract) external view returns(uint256);
    function getClaimingContractUserTotalNext(string memory _claimingContract) external view returns(uint256);
    function getClaimingContractUserTotalCurrent(string memory _claimingContract) external view returns(uint256);  
    function getClaimingContractUserHasClaimed(uint256 _claimIntervalStartTime, string memory _claimingContract, address _claimerAddress) external view returns(bool);
    function getClaimingContractUserCanClaim(string memory _claimingContract, address _claimerAddress) external view returns(bool);
    function getClaimingContractUserRegisteredTime(string memory _claimingContract, address _claimerAddress) external view returns(uint256);
    function getClaimingContractAllowance(string memory _claimingContract) external view returns(uint256);
    function getClaimingContractPerc(string memory _claimingContract) external view returns(uint256);
    function getClaimingContractPercLast(string memory _claimingContract) external view returns(uint256);
    function getClaimingContractExists(string memory _contractName) external view returns (bool);
    function getClaimingContractEnabled(string memory _contractName) external view returns (bool);
    function getClaimAmount(string memory _claimingContract, address _claimerAddress, uint256 _claimerAmountPerc) external view returns (uint256);
    function registerClaimer(address _claimerAddress, bool _enabled) external;
    function claim(address _claimerAddress, address _toAddress, uint256 _claimerAmount) external;
}
