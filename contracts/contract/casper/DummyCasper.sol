pragma solidity 0.4.19;


import "../Ownable.sol";


/// @title A dummy shell Casper contract used to simulate sending to and receiving from the actual Casper contract when it's completed. 
 // We're using functions that exist in Casper that RP will need to interact with. The logic of these functions is much simpler as we only need to simulate the inputs/outputs from the contract primarily with some basic checks
/// @author David Rugendyke
contract DummyCasper is Ownable {

    /**** Vars ************/
    uint128 public withdrawal_delay = 1;                                    // Blocks until the actual withdrawal can happen after requesting
    uint128 public dynasty;                                                 // The current dynasty - increment when votes[epoch-2].is_finalized
    uint256 public next_dynasty_wei_delta;                                  // Amount of wei added to the total deposits in the next dynasty
    uint256 public second_next_dynasty_wei_delta;                           // Amount of wei added to the total deposits in the dynasty after that
    uint256 public total_curdyn_deposits;                                   // Total deposits in the current dynasty
    uint256 public total_prevdyn_deposits;                                  // Total deposits in the previous dynasty
    uint256 public base_interest_factor;                                    // Base interest factor
    uint128 public current_epoch = 0;                                       // Initialize the epoch counter
    uint128 public epoch_length = 5;                                        // How many blocks in an epoch
    int128 public expected_source_epoch = 0;                                // Expected source epoch to be justified next
    uint256 public min_deposit_size = 2 ether;                              // Min deposit required
    //mapping (int128 => uint256)  public deposit_scale_factor = 1 ether;   // Value used to calculate the per-epoch fee that validators should be charged given as a % of 1 Ether = 100%, 0.5 Ether = 50%
    mapping (uint128 => uint128) public dynasty_start_epoch;                // Mapping of dynasty to start epoch of that dynasty
    uint128 public dynasty_logout_delay = 2;                                // Logout delay in dynasties

    bool public simulate_penalties = false;                                 // Simulate penalties in Casper

    mapping (uint128 => uint256[]) public vote_bitmap;                     // Records what validators have voted on an epoch (key==epoch, value==array<validator>)


    /**** Contracts ********/

    address public sighasher;                                               //  Sighash calculator library address
    address public purity_checker;                                          // The purity checker
    

    /**** Validators ***************/

    mapping (uint256 => Validator) public validators;                       // The current validators
    mapping (address => uint128)  public validator_indexes;                 // All validators are indexed by their withdrawal address
    uint128 next_validator_index = 1;                                       // Number of validators


    /*** Structs ***************/

    struct Validator {
        uint128 deposit;
        uint128 start_dynasty;
        uint128 end_dynasty;
        address addr;
        address withdrawal_addr;
        bool exists;
    }


    /*** Events ***************/

    event Transfered (
        address from,
        address to, 
        bytes32 typeOf, 
        uint256 value,
        uint256 created
    );

    event Logout (
        address addressSender,
        uint256 created
    );

    event Withdrawal (
        address addressSender,
        uint256 amount,
        uint256 created
    );

    event CasperVoteCast (
        bytes voteMessage
    );
    



    /// @dev DummyCasper constructor
     // Must be sent an amount of Ether to cover simulated rewards after contract creation 
    function DummyCasper() public {}

    /// @dev Added our payable fallback so we can seed this contract on deployment with some Ether to cover the rewards sent back
    function() public payable {}


    /// @dev Get the validator index for the withdrawal address
    function get_validator_indexes(address withdrawal_addr) public view returns(uint128) {
        return validator_indexes[withdrawal_addr];
    }

    /// @dev Get the current Casper epoch
    function get_current_epoch() public view returns(uint128) {
        return current_epoch;
    }

     /// @dev Get the current Casper dynasty
    function get_dynasty() public view returns(uint128) {
        return dynasty;
    }

    /// @dev Get the current Casper epoch
    function get_deposit_size(uint256 validator_index) public view returns(uint128) {
        // We're not simulating caspers epochs, so leave out "* deposit_scale_factor[current_epoch]" from the result
        return validators[validator_index].deposit;
    }

    /// @dev Get the validator start dynasty
    function get_validators__dynasty_start(uint128 validator_index) public view returns (uint128) {
        return validators[validator_index].start_dynasty;
    }

    /// @dev Get the validator end dynasty
    function get_validators__dynasty_end(uint128 validator_index) public view returns (uint128) {
        return validators[validator_index].end_dynasty;
    }

    /// @dev Get the validator address
    function get_validators__addr(uint128 validator_index) public view returns (address) {
        return validators[validator_index].addr;
    }

    /// @dev Get the validator withdrawal address
    function get_validators__withdrawal_address(uint128 validator_index) public view returns (address) {
        return validators[validator_index].withdrawal_addr;
    }

    /// @dev Get the current withdrawal delay in blocks
    function get_withdrawal_delay() public view returns(uint256) {
        return withdrawal_delay;
    }

    /// @dev Get the current start epoch of this dynasty
    function get_dynasty_start_epoch(uint128 _dynasty) public view returns (uint128) {
        return dynasty_start_epoch[_dynasty];
    }

    /// @dev Get th current epoch of this dynasty
    function get_dynasty_in_epoch(uint128 _dynasty) public view returns (uint128) {
        return dynasty_start_epoch[_dynasty];
    }

    /// @dev Gets the recommended source epoch used during voting
    function get_recommended_source_epoch() public view returns (int128) {
        return expected_source_epoch;
    }

    /// @dev Gets the recommended target block hash to be voted on
    function get_recommended_target_hash() public view returns (bytes32) {
        return block.blockhash(current_epoch * (epoch_length - 1));
    }

    /// @dev Gets the number of dynasties that we need to wait before we are logged out
    function get_dynasty_logout_delay() public view returns (uint128) {
        return dynasty_logout_delay;
    }

    /// @dev Gets whether a validator has voted on a particular epoch as a bitmap
    function votes__vote_bitmap(uint128 _epoch, uint128 _validator_index) public returns(uint256) {        
        return vote_bitmap[_epoch][_validator_index / 256];
    }
    

    /// @notice Send `msg.value ether` Casper from the account of `message.caller.address()`
    function deposit(address validator_address, address withdrawal_address) public payable { 
        // We don't need to verify the signature just for testing 
        // assert extract32(raw_call(purity_checker, concat('\xa1\x90>\xab', as_bytes32(validation_addr)), gas=500000, outsize=32), 0) != as_bytes32(0)
        // Make sure this withdrawal address isn't already being used by a validator
        assert(!validators[next_validator_index].exists);
        // Make sure its ok size wize
        assert(msg.value >= min_deposit_size);
        // Add the validator if it passes all the required conditions
        validators[next_validator_index] = Validator ({
            deposit: uint128(msg.value),
            start_dynasty: dynasty + 2,
            end_dynasty: 1000000000000000000000000000000,
            addr: validator_address,
            withdrawal_addr: withdrawal_address,
            exists: true
        });
        validator_indexes[withdrawal_address] = next_validator_index;
        next_validator_index += 1;
        second_next_dynasty_wei_delta += msg.value;
        // All good? Fire the event for the new deposit
        Transfered(msg.sender, this, keccak256("deposit"), msg.value, now); 
            
    }


    /// @dev Start the process for a withdrawal
    function logout(bytes logout_msg) public { 
        // We're not simulating signatures, so just doing this to prevent warning of non-use
        bytes(logout_msg);
        // We're not using signatures to identify validators via messages in this dummy casper, just use msg.sender for now
        uint256 validator_index = validator_indexes[msg.sender];
        // Make sure we haven't already withdrawn
        assert(validators[validator_index].end_dynasty > dynasty + dynasty_logout_delay);
        // Set the end dynasty
        validators[validator_index].end_dynasty = dynasty + dynasty_logout_delay;
        second_next_dynasty_wei_delta -= validators[validator_index].deposit;
        // Fire the event
        Logout(msg.sender, now);
    }

    /// @dev Allow a validator to withdraw their deposit +interest/-penalties
    function withdraw(uint256 validator_index) public returns(bool) { 
        // Check that we can withdraw
        assert(dynasty >= validators[validator_index].end_dynasty + 1);
        // Withdraw
        uint256 withdraw_amount = validators[validator_index].deposit;
        // Set the amount to send
        uint256 withdrawal_amount_processed = 0;
        // For testing purposes, we can similar penalties for the pool (which is highly unlikely unless we were purposefully trying to cheat)
        if (simulate_penalties) {
            // Simulate losing 4% of the deposit for nodes being offline or other external circumstances - remove the decimal by multiplying and dividing by 100
            withdrawal_amount_processed = withdraw_amount - ((withdraw_amount * 4) / 100); 
        } else {
            // Post alpha to simulate getting accurate returns, we'll be using a basic interest calculation A = P(1 + rt) (not needed atm)
            // uint256 daysDiff = (now - validators[validationCode].withdrawalEpoch) / (60 * 60 * 24);
            // withdrawal_amount_processed = withdraw_amount * (1 + (interestPerYear/100) * (daysDiff/365));
            // Our withdrawal + the simulated earned rewards (using a set fake reward of 2% of the deposit regardless of time staking so that Rocket Pool can process receiving its initial deposit + rewards)
            withdrawal_amount_processed = withdraw_amount + ((withdraw_amount * 2) / 100); 
        }      
        // Send the deposit + rewards back to the deposit address 
        // Note that ideally it would be great to use address.send(etherAmount) here so we can test the result, however due to security on the .send function, its gas is very limited
        // and this fails on contract -> contract sends (thanks to ConsenSys for the breakdown - https://github.com/ConsenSys/Ethereum-Development-Best-Practices/wiki/Fallback-functions-and-the-fundamental-limitations-of-using-send()-in-Ethereum-&-Solidity )
        // So in its place we'll just call the address of the contract and send the value (this forwards the gas needed), tho we can't test the result here as easily, but this will work for now in place of the real Casper
        // If Casper when finished doesn't support contract -> contract deposit returns with gas, we can use a registered Rocket Node checkin to action the deposit after it's received by a minipool
        // assert(validators[validator_index].withdrawal_addr.call.value(withdrawal_amount_processed)() == true);
        // Update: Looks like Casper just uses Send which won't allow for any automatic remote contract execution due to limited gas. We'll use smart node checkins now to check for return deposits and action them automatically
        assert(validators[validator_index].withdrawal_addr.send(withdrawal_amount_processed));
        // Remove the validator now
        delete_validator(validator_index);
        // Log it
        Withdrawal(validators[validator_index].withdrawal_addr, withdrawal_amount_processed, now);
    }

    /// @dev Cast a validator vote to Casper
    function vote(bytes _vote_msg) public {
        CasperVoteCast(_vote_msg);
    }

    /// @dev Delete the validator
    function delete_validator(uint256 validator_index) private { 
        validators[validator_index].deposit = 0;
        validators[validator_index].start_dynasty = 0;
        validators[validator_index].end_dynasty = 0;
        validators[validator_index].addr = 0;
        validators[validator_index].withdrawal_addr = 0;
    }

    /// @dev Increment the current epoc to simulate Caspers epochs incrementing
    function set_increment_epoch() public onlyOwner { 
        // Set the current epoch
        current_epoch += 1;
        vote_bitmap[current_epoch] = new uint256[](5);
    }

    /// @dev Simulate a validator voting
    function set_voted(uint256 _validator_index, uint128 _epoch) public onlyOwner {
        // create a bit mask to retrieve the has-voted value for our validator index
        // e.g 000000000100000000000 
        uint256 bitMask = 0x1 * uint256(2) ** (_validator_index % 256);
        // the bitwise | operator effectively updates the bitmap with a value for the validator (true)
        vote_bitmap[_epoch][_validator_index / 256] = vote_bitmap[_epoch][_validator_index / 256] | bitMask;
    }

    /// @dev Increment the dynasty to simulate Caspers blocks being finalised
    function set_increment_dynasty() public onlyOwner { 
        dynasty += 1;
        // Update the start of the dynasty epoch
        dynasty_start_epoch[dynasty] = current_epoch;
        total_prevdyn_deposits = total_curdyn_deposits;
        total_curdyn_deposits += next_dynasty_wei_delta;
        next_dynasty_wei_delta = second_next_dynasty_wei_delta;
        second_next_dynasty_wei_delta = 0;
    }

    /// @dev Simulate penalties by Casper happening
    function set_simulate_penalties(bool _option) public onlyOwner { 
        simulate_penalties = _option;
    }
}