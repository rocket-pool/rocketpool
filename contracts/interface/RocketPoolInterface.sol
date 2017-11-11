pragma solidity 0.4.18;

contract RocketPoolInterface {
    /// @dev Deposits must be validated
    modifier acceptableDeposit() {_;}
    /// @dev Existing mini pools are allowed to be closed and selfdestruct when finished
    modifier poolsAllowedToBeClosed() {_;}
    /// @dev Only allow access from the a RocketMiniPool contract
    modifier onlyMiniPool() {_;}
    /// @dev Only allow access from the latest version of the main RocketPartnerAPI contract
    modifier onlyLatestRocketPartnerAPI() {_;}
    /// @dev Only allow access from the latest version of the main RocketNode contract
    modifier onlyLatestRocketNode() {_;}
    /// @dev Only allow access for deposits from the User contract and Partner contract
    modifier onlyAuthorisedDepositContracts() {_;}
    /// @dev Deposit to Rocket Pool, can be from a user or a partner on behalf of their user
    /// @param _userAddress The address of the user whom the deposit belongs too
    /// @param _partnerAddress The address of the registered 3rd party partner whom is in control of the supplid user account that the deposit belongs too
    /// @param _poolStakingTimeID The ID that determines which pool the user intends to join based on the staking time of that pool (3 months, 6 months etc)
    function deposit(address _userAddress, address _partnerAddress, string _poolStakingTimeID) external payable acceptableDeposit onlyAuthorisedDepositContracts returns(bool);
    /// @dev See if there are any pools thats launch countdown has expired that need to be launched for staking
    /// @param _nodeRequestingAddress The address of the node requesting this action
    function poolNodeActions(address _nodeRequestingAddress) onlyLatestRocketNode external;
    /// @param amount The amount in Wei to withdraw, passing 0 will withdraw the users whole balance.
    function userPartnerWithdrawDeposit(address miniPoolAddress, uint256 amount, address partnerUserAddress, address partnerAddress) public onlyLatestRocketPartnerAPI returns(bool);
    /// @dev MiniPools can request the main contract to be removed
    function removePool() public poolsAllowedToBeClosed onlyMiniPool returns(bool);
}