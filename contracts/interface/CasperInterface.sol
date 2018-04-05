pragma solidity 0.4.19;


/// @title An interface for Caspers methods that RocketPool will need (this will obviously change a bit until Casper is spec'd 100%, but allows for easier integration)
/// @author David Rugendyke
contract CasperInterface {
    /// @dev Only allow access from the owner
    modifier onlyOwner() {_;}
     /// @dev Get the current Casper dynasty
    function get_dynasty() public view returns(uint128);
    /// @dev Get the validator index for the withdrawal address
    function get_validator_indexes(address withdrawal_addr) public view returns(uint128);
     /// @dev Get the current Casper epoch
    function get_current_epoch() public view returns(uint128);
    /// @dev Get the current Casper epoch
    function get_deposit_size(uint256 validator_index) public view returns(uint128);
    /// @dev Get the current withdrawal delay in blocks
    function get_withdrawal_delay() public view returns(uint128);
    /// @notice Send `msg.value ether` Casper from the account of `message.caller.address()`
    function deposit(address validator_address, address withdrawal_address) public payable;
    /// @dev Start the process for a withdrawal
    function logout(bytes logout_msg) public;
    /// @dev Allow a validator to withdraw their deposit +interest/-penalties
    function withdraw(uint256 validator_index) public returns(bool); 
    /// @dev Get the current start epoch of this dynasty
    function get_dynasty_start_epoch(uint128 dynasty) public view returns (uint128);
    function get_dynasty_in_epoch(uint128 _dynasty) public view returns (uint128);
    /// @dev Validator data 
    function get_validators__dynasty_start(uint128 validator_index) public view returns (uint128);
    function get_validators__dynasty_end(uint128 validator_index) public view returns (uint128);
    function get_validators__addr(uint128 validator_index) public view returns (address);
    function get_validators__withdrawal_address(uint128 validator_index) public view returns (address);
    /// @dev Voting functions
    function get_recommended_source_epoch() public view returns (int128);
    function get_recommended_target_hash() public view returns (bytes32);
    function vote(bytes _vote_msg) public;

    /// @dev RP only - Increment the current epoc to simulate Caspers epochs incrementing
    function set_increment_epoch() onlyOwner public;
    /// @dev RP only - Increment the dynasty to simulate Caspers blocks being finalised
    function set_increment_dynasty() onlyOwner public;


}