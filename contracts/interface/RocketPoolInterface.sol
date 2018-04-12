pragma solidity 0.4.19;


contract RocketPoolInterface {
    /// @dev Deposits must be validated
    modifier acceptableDeposit() {_;}
    /// @dev Existing mini pools are allowed to be closed and selfdestruct when finished
    modifier poolsAllowedToBeClosed() {_;}
    /// @dev Only allow access from the a RocketMiniPool contract
    modifier onlyMiniPool() {_;}
    /// @dev Only allow access from the latest version of the main RocketUser contract
    modifier onlyLatestRocketUser() {_;}
    /// @dev Only allow access from the latest version of the main RocketNode contract
    modifier onlyLatestRocketNode() {_;}
    /// @dev Only allow access for deposits from the User contract and Partner contract
    modifier onlyAuthorisedDepositContracts() {_;}
    /// @dev Returns a count of the current minipools attached to this node address
    /// @param _nodeAddress Address of the node
    function getPoolsFilterWithNodeCount(address _nodeAddress) view public returns(uint256);
    /// @dev Deposit to Rocket Pool, can be from a user or a partner on behalf of their user
    /// @param _userAddress The address of the user whom the deposit belongs too
    /// @param _partnerAddress The address of the registered 3rd party partner whom is in control of the supplid user account that the deposit belongs too
    /// @param _poolStakingTimeID The ID that determines which pool the user intends to join based on the staking time of that pool (3 months, 6 months etc)
    function deposit(address _userAddress, address _partnerAddress, string _poolStakingTimeID) external payable acceptableDeposit onlyAuthorisedDepositContracts returns(bool);
    /// @dev Get an available minipool for a user to be assigned too
    /// @param _newUserAddress New user account
    /// @param _partnerAddress The address of the Rocket Pool partner
    /// @param _poolStakingDuration The duration that the user wishes to stake for
    function addUserToAvailablePool(address _newUserAddress, address _partnerAddress, uint256 _poolStakingDuration) external onlyLatestRocketUser() returns(address);
    function addUserToAvailablePoolTest(address _newUserAddress, address _partnerAddress, uint256 _poolStakingDuration) external onlyLatestRocketUser() returns(address);
    /// @dev See if there are any pools thats launch countdown has expired that need to be launched for staking
    function poolNodeActions() onlyLatestRocketNode external;
    /// @dev MiniPools can request the main contract to be removed
    function removePool() public poolsAllowedToBeClosed onlyMiniPool returns(bool);
    /// @dev Cast Casper votes via minipools 
    /// @param _node_address The address of the node calling vote
    /// @param _epoch The epoch number voting relates to
    /// @param _minipool_address The address of the minipool that should cast the vote
    /// @param _vote_message Vote message to be sent to Casper
    function vote(address _node_address, uint256 _epoch, address _minipool_address, bytes _vote_message) public onlyLatestRocketNode returns(bool);
}