pragma solidity ^0.4.17;

contract RocketPoolInterface {
    /// @dev Existing mini pools are allowed to be closed and selfdestruct when finished
    modifier poolsAllowedToBeClosed() {_;}
    /// @dev Only allow access from the a RocketMiniPool contract
    modifier onlyMiniPool() {_;}
    /// @dev Only allow access from the latest version of the main RocketPartnerAPI contract
    modifier onlyLatestRocketPartnerAPI() {_;}
    /// @dev Only allow access from the latest version of the main RocketNode contract
    modifier onlyLatestRocketNode() {_;}
    /// @dev See if there are any pools thats launch countdown has expired that need to be launched for staking
    /// @param _nodeRequestingAddress The address of the node requesting this action
    function setPoolActionLaunch(address _nodeRequestingAddress) onlyLatestRocketNode external;
    /// @dev Deposit to Rocket Pool from the 3rd party partner API
    function depositPartner(address _partnerAddress, address _partnerUserAddress, string _poolStakingTimeID) public payable onlyLatestRocketPartnerAPI returns(bool);
    /// @param amount The amount in Wei to withdraw, passing 0 will withdraw the users whole balance.
    function userPartnerWithdrawDeposit(address miniPoolAddress, uint256 amount, address partnerUserAddress, address partnerAddress) public onlyLatestRocketPartnerAPI returns(bool);
    /// @dev MiniPools can request the main contract to be removed
    function removePool() public poolsAllowedToBeClosed onlyMiniPool returns(bool);
    /// @dev Get all pools that are assigned to this node (explicit method)
    /// @param nodeAddress Get pools with the current node
     // TODO: When metropolis is released, this method can be removed as we'll be able to read variable length data between contracts then
    function getPoolsFilterWithNodeCount(address nodeAddress) public view returns(uint256);
}