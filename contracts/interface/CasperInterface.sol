pragma solidity 0.4.23;


/// @title An interface for Caspers methods that RocketPool will need (this will obviously change a bit until Casper is spec'd 100%, but allows for easier integration)
/// @author David Rugendyke
contract CasperInterface {
    /// @dev Get the current Casper dynasty
    function dynasty() public view returns(int128);
    /// @dev Get the validator index for the withdrawal address
    function validator_indexes(address withdrawal_addr) public view returns(int128);
    /// @dev Get the current Casper epoch
    function current_epoch() public view returns(int128);
    /// @dev Get the last finalised Casper epoch
    function last_finalized_epoch() public view returns(int128);
    /// @dev Get the current deposit size for a validator
    function deposit_size(int128 validator_index) public view returns(int128);
    /// @dev Get the current withdrawal delay in blocks
    function WITHDRAWAL_DELAY() public view returns(int128);
    /// @dev Gets the number of dynasties that we need to wait before we are logged out
    function DYNASTY_LOGOUT_DELAY() public view returns (int128);
    /// @dev Gets the number of blocks in a Casper epoch
    function EPOCH_LENGTH() public view returns (int128);
    /// @notice Send `msg.value ether` Casper from the account of `message.caller.address()`
    function deposit(address validator_address, address withdrawal_address) public payable;
    /// @dev Start the process for a withdrawal
    function logout(bytes logout_msg) public;
    /// @dev Allow a validator to withdraw their deposit +interest/-penalties
    function withdraw(int128 validator_index) public; 
    /// @dev Get the current start epoch of this dynasty
    function dynasty_start_epoch(int128 _dynasty) public view returns (int128);
    function dynasty_in_epoch(int128 _dynasty) public view returns (int128);    
    /// @dev Validator data 
    function validators__start_dynasty(int128 validator_index) public view returns (int128);
    function validators__end_dynasty(int128 validator_index) public view returns (int128);
    function validators__addr(int128 validator_index) public view returns (address);
    function validators__withdrawal_addr(int128 validator_index) public view returns (address);
    /// @dev Voting functions
    function checkpoints__vote_bitmap(int128 _epoch, int128 _validator_index) public returns(uint256);
    function recommended_source_epoch() public view returns (int128);
    function recommended_target_hash() public view returns (bytes32);
    function vote(bytes _vote_msg) public;
}