pragma solidity 0.4.23;


contract RocketPoolInterface {
    /// @dev Returns a count of the current minipools attached to this node address
    /// @param _nodeAddress Address of the node
    function getPoolsFilterWithNodeCount(address _nodeAddress) view public returns(uint256);
    /// @dev Deposit to Rocket Pool, can be from a user or a partner on behalf of their user
    /// @param _userAddress The address of the user whom the deposit belongs too
    /// @param _partnerAddress The address of the registered 3rd party partner whom is in control of the supplid user account that the deposit belongs too
    /// @param _poolStakingTimeID The ID that determines which pool the user intends to join based on the staking time of that pool (3 months, 6 months etc)
    function deposit(address _userAddress, address _partnerAddress, string _poolStakingTimeID) external payable returns(bool);
    /// @dev Get an available minipool for a user to be assigned too
    /// @param _newUserAddress New user account
    /// @param _partnerAddress The address of the Rocket Pool partner
    /// @param _poolStakingDuration The duration that the user wishes to stake for
    function addUserToAvailablePool(address _newUserAddress, address _partnerAddress, uint256 _poolStakingDuration) external returns(address);
    function addUserToAvailablePoolTest(address _newUserAddress, address _partnerAddress, uint256 _poolStakingDuration) external returns(address);
    /// @dev See if there are any pools thats launch countdown has expired that need to be launched for staking
    function poolNodeActions() external;
    /// @dev MiniPools can request the main contract to be removed
    function removePool() public returns(bool);
    /// @dev Cast Casper votes via minipools 
    /// @param _node_address The address of the node calling vote
    /// @param _epoch The epoch number voting relates to
    /// @param _minipool_address The address of the minipool that should cast the vote
    /// @param _vote_message Vote message to be sent to Casper
    function vote(address _node_address, uint256 _epoch, address _minipool_address, bytes _vote_message) public returns(bool);
    /// @dev Log the minipool out of Casper and wait for withdrawal
    /// @param _node_address The address of the node calling logout
    /// @param _minipool_address The address of the minipool to logout of Casper
    /// @param _logout_message The constructed logout message from the node containing RLP encoded: [validator_index, epoch, node signature]
    function logout(address _node_address, address _minipool_address, bytes _logout_message) public returns(bool);  
}