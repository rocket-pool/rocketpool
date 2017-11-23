pragma solidity 0.4.18;

import "../../contract/Owned.sol";


/// @title A dummy shell Casper contract used to simulate sending to and receiving from the actual Casper contract when it's completed. 
 // Obviously this could change a lot and in no way reflects the actual Casper code, it's just a basic contract simulation based on the Mauve Paper for Rocket Pool to interact with until actual Casper is done or specified 100%.
/// @author David Rugendyke

contract DummyCasper is Owned {

    /**** Storage ************/
    uint256 public blockTime;
    uint256 public epochLength;
    uint256 public withdrawalDelay;
    uint256 public withdrawalDefaultEpoch;
    uint256 public minDepositWei;
    uint256 public maxDepositWei;
    uint256 public interestPerYear;


    /**** Validators ***************/

    // The current validators
    mapping (address => Validator) private validators;
    // Keep an array of all our validator sender addresses for iteration
    address[] private validatorSenderAddresses;
    // Number of validators
    uint256 nextValidatorIndex;


    /*** Structs ***************/

    struct Validator {
        uint256 deposit;
        address withdrawalAddress;
        uint256 dynastyStart;
        uint256 dynastyEnd;
        uint256 withdrawalEpoch;
        uint256 prevCommitEpoch;
        uint256 addedEpoch;
           bool exists;
    }

    /*** Events ***************/

    event Transfered (
        address indexed _from,
        address indexed _to, 
        bytes32 indexed _typeOf, 
        uint256 value,
        uint256 created
    );

    event WithdrawalRequested (
        address indexed _addressSender,
        uint256 created
    );

    event Withdrawal (
        address indexed _addressSender,
        uint256 amount,
        uint256 created
    );

    event FlagUint (
        uint256 flag
    );

    event FlagAddress (
        address flag
    );


    /*** Modifiers *************/

    /// @dev Deposits must be validated
    modifier acceptableDeposit(uint256 deposit) {
        assert (deposit > minDepositWei || deposit < maxDepositWei);
        _;
    }

    /// @dev Withdrawals must only occur after the withdrawal epoch has been met
    /// @param withdrawalEpoch The time the validator can withdraw
    modifier acceptableWithdrawal(uint256 withdrawalEpoch) {
        assert (now > withdrawalEpoch || withdrawalEpoch > 0);
        _;
    }

    /// @dev A valid registered node
    modifier registeredValidator(address validatorSenderAddress) {
        assert (validators[validatorSenderAddress].exists == true);
        _;
    }


    /// @dev DummyCasper constructor
     // Must be sent an amount of Ether to cover simulated rewards after contract creation 
    function DummyCasper() public {
        // Set Casper testing parameters
        blockTime = 14;
        epochLength = 100;
        // Validator index
        nextValidatorIndex = 0;
        // Test settings
        minDepositWei = 1 ether;
        maxDepositWei = 200 ether;
        // Only ~2 minutes, for testing purposes
        withdrawalDelay = 2 minutes;
        // Default time for allowable withdrawal
        withdrawalDefaultEpoch = 1000000000000000000000000000000;
        // Casper interest per year (not real atm)
        interestPerYear = 5;
    }


    /// @dev Added our payable fallback so we can seed this contract on deployment with some Ether to cover the rewards sent back
    function() public payable {}

    /// @dev Adds a new validator to Casper
    function addValidator(uint256 newDeposit,  address newWithdrawalAddress) private acceptableDeposit(newDeposit) returns(bool) {

        // Add the new validator
        if (newWithdrawalAddress != 0) {
            // Add the new validator to the mapping of validation structs
            validators[msg.sender] = Validator({
                       deposit: newDeposit, 
             withdrawalAddress: newWithdrawalAddress, 
               withdrawalEpoch: withdrawalDefaultEpoch, 
                  dynastyStart: 0, 
                    dynastyEnd: 1000000000000000000000000000000, 
               prevCommitEpoch: 0, 
                    addedEpoch: now, 
                        exists: true
            });
            // Increment the validator index
            nextValidatorIndex += 1;
            // Add the address
            validatorSenderAddresses.push(msg.sender);
            // Success
            return true;
        }
        return false;
    }


    /// @notice Send `msg.value ether` Casper from the account of `message.caller.address()`
    function deposit(address newWithdrawalAddress) public payable returns(bool) { 
        // Add the validator if it passes all the required conditions
        if (addValidator(msg.value, newWithdrawalAddress)) {
            // All good? Fire the event for the new deposit
            Transfered(msg.sender, this, keccak256("deposit"), msg.value, now); 
            return true;
        }else{
            return false;
        }
    }


    /// @dev Start the process for a withdrawal
    function startWithdrawal() public registeredValidator(msg.sender) returns(bool) { 
        // If this a registed validator and has not already request withdrawal?
         if (validators[msg.sender].withdrawalEpoch == withdrawalDefaultEpoch) {
            // Cool, lets set the time the withdrawal will be allowed now
            validators[msg.sender].withdrawalEpoch = now + withdrawalDelay;
            // Fire the event
            WithdrawalRequested(msg.sender, now);
            // Return
            return true;
         }
         return false;
    }

    /// @dev Allow a validator to withdraw their deposit +interest/-penalties
    function withdraw(bool simulatePenalties) public registeredValidator(msg.sender) returns(bool) { 
        // If this a registed validator and has not already request withdrawal?
         if (validators[msg.sender].withdrawalEpoch <= now && validators[msg.sender].deposit > 0) {
            // Set the amount to send
            uint256 withdrawalAmount = validators[msg.sender].deposit;
            uint256 withdrawalAmountProcessed = 0;
            // For testing purposes, we can similar penalties for the pool (which is highly unlikely unless we were purposefully trying to cheat)
            if (simulatePenalties) {
                // Simulate losing 4% of the deposit for nodes being offline or other external circumstances - remove the decimal by multiplying and dividing by 100
                withdrawalAmountProcessed = withdrawalAmount - ((withdrawalAmount * 4) / 100); 
            } else {
                // Post alpha to simulate getting accurate returns, we'll be using a basic interest calculation A = P(1 + rt) (not needed atm)
                // uint256 daysDiff = (now - validators[validationCode].withdrawalEpoch) / (60 * 60 * 24);
                // withdrawalAmountProcessed = withdrawalAmount * (1 + (interestPerYear/100) * (daysDiff/365));
                // Our withdrawal + the simulated earned rewards (using a set fake reward of 2% of the deposit regardless of time staking so that Rocket Pool can process receiving its initial deposit + rewards)
                withdrawalAmountProcessed = withdrawalAmount + ((withdrawalAmount * 2) / 100); 
            }      
            // Send the deposit + rewards back to the deposit address 
            // Note that ideally it would be great to use address.send(etherAmount) here so we can test the result, however due to security on the .send function, its gas is very limited
            // and this fails on contract -> contract sends (thanks to ConsenSys for the breakdown -https://github.com/ConsenSys/Ethereum-Development-Best-Practices/wiki/Fallback-functions-and-the-fundamental-limitations-of-using-send()-in-Ethereum-&-Solidity )
            // So in its place we'll just call the address of the contract and send the value (this forwards the gas needed), tho we can't test the result here as easily, but this will work for now in place of the real Casper
            // If Casper when finished doesn't support contract -> contract deposit returns, we can use a registered Rocket Node as an oracle to receive the deposit and forward it to the mini pool
            bool success = validators[msg.sender].withdrawalAddress.call.value(withdrawalAmountProcessed)();
            if (success) {
                Withdrawal(msg.sender, withdrawalAmount, now);
                return true;
            }
            return false;
            
         }
    }

    /// @dev Not documented in Casper yet, but would be agreat method to have that would allow users/contracts to know exactly when they can withdraw their deposit by returning a timestamp of it
     // If its not available, we can simply add a storage var to RocketSettings that can match/be slightly longer than Caspers and do the same thing
    function getWithdrawalEpoch(address validatorSenderAddress) public view registeredValidator(validatorSenderAddress) returns(uint256) { 
        return validators[validatorSenderAddress].withdrawalEpoch;
    }

    /// @dev Set the Withdrawal Epoch - used for unit testing purposes in Rocket Pool
    function setWithdrawalEpoch(address validatorSenderAddress, uint256 newWithdrawalEpoch) public onlyOwner registeredValidator(validatorSenderAddress) { 
        validators[validatorSenderAddress].withdrawalEpoch = newWithdrawalEpoch;
    }

}