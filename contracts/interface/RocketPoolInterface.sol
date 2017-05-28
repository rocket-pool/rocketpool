pragma solidity ^0.4.2;

contract RocketPoolInterface {
    /// @dev Existing mini pools are allowed to be closed and selfdestruct when finished
    modifier poolsAllowedToBeClosed() {_;}
    /// @dev Only allow access from the a RocketMiniPool contract
    modifier onlyMiniPool() {_;}
    /// @dev Only allow access from the latest version of the main RocketPartnerAPI contract
    modifier onlyLatestRocketPartnerAPI() {_;}
    /// @dev Deposit to Rocket Pool from the 3rd party partner API
    function partnerDeposit(address partnerAddress, address partnerUserAddress, bytes32 poolStakingTimeID) public payable onlyLatestRocketPartnerAPI returns(bool);
    /// @param amount The amount in Wei to withdraw, passing 0 will withdraw the users whole balance.
    function userPartnerWithdrawDeposit(address miniPoolAddress, uint256 amount, address partnerUserAddress, address partnerAddress) public onlyLatestRocketPartnerAPI returns(bool);
    /// @dev MiniPools can request the main contract to be removed
    function removePool() poolsAllowedToBeClosed onlyMiniPool returns(bool);
}