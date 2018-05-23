pragma solidity 0.4.23;


/// @title An interface for Caspers methods that RocketPool will need (this will obviously change a bit until Casper is spec'd 100%, but allows for easier integration)
/// @author David Rugendyke
contract CasperInterface {
     /// @dev Get the current Casper dynasty
    function dynasty() public view returns(uint128);
    /// @dev Get the validator index for the withdrawal address
    function validator_indexes(address withdrawal_addr) public view returns(uint128);
     /// @dev Get the current Casper epoch
    function get_current_epoch() public view returns(uint128);
    /// @dev Get the current Casper epoch
    function get_deposit_size(uint256 validator_index) public view returns(uint128);
    /// @dev Get the current withdrawal delay in blocks
    function get_withdrawal_delay() public view returns(uint128);
    /// @dev Gets the number of dynasties that we need to wait before we are logged out
    function DYNASTY_LOGOUT_DELAY() public view returns (uint128);
    /// @dev Gets the number of blocks in a Casper epoch
    function get_epoch_length() public view returns (uint128);
    /// @notice Send `msg.value ether` Casper from the account of `message.caller.address()`
    function deposit(address validator_address, address withdrawal_address) public payable;
    /// @dev Start the process for a withdrawal
    function logout(bytes logout_msg) public;
    /// @dev Allow a validator to withdraw their deposit +interest/-penalties
    function withdraw(uint256 validator_index) public returns(bool); 
    /// @dev Get the current start epoch of this dynasty
    function dynasty_start_epoch(uint128 _dynasty) public view returns (uint128);
    function dynasty_in_epoch(uint128 _dynasty) public view returns (uint128);    
    /// @dev Validator data 
    function validators__start_dynasty(uint128 validator_index) public view returns (uint128);
    function validators__end_dynasty(uint128 validator_index) public view returns (uint128);
    function get_validators__addr(uint128 validator_index) public view returns (address);
    function get_validators__withdrawal_address(uint128 validator_index) public view returns (address);
    /// @dev Voting functions
    function votes__vote_bitmap(uint128 _epoch, uint128 _validator_index) public returns(uint256);
    function get_recommended_source_epoch() public view returns (int128);
    function get_recommended_target_hash() public view returns (bytes32);
    function vote(bytes _vote_msg) public;

    /// @dev RP only - Increment the current epoc to simulate Caspers epochs incrementing
    function set_increment_epoch() public;
    /// @dev RP only - Increment the dynasty to simulate Caspers blocks being finalised
    function set_increment_dynasty() public;
}