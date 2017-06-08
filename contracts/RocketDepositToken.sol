pragma solidity ^0.4.8;

import "./RocketHub.sol";
import "./interface/TokenERC20Interface.sol";
import "./interface/RocketSettingsInterface.sol";
import "./lib/Arithmetic.sol";


/// @title The Rocket Pool Deposit Token - Can be used as a backing of your deposit and traded with others while staking
/// @author David Rugendyke

contract RocketDepositToken is ERC20TokenInterface, Owned  {

    /**** Properties ***********/

    // Address of the main RocketHub contract
    address private rocketHubAddress;
    // Token details
    string public constant symbol = "RPD";
    string public constant name = "Rocket Pool Deposit";
    uint8 public constant decimals = 18;
    // Total supply
    uint256 public totalSupply = 0;
    // Balances for each account
    mapping(address => uint256) balances;
    // Owner of account approves the transfer of an amount to another account
    mapping(address => mapping (address => uint256)) allowed;
    // Use this as our base unit to remove the decimal place by multiplying and dividing by it since solidity doesn't support reals yet
    uint256 calcBase = 1000000000000000000;


    /*** Modifiers *************/

    /// @dev Only allow access from the latest version of the RocketPool contract
    modifier onlyLatestRocketPool() {
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        if (msg.sender != rocketHub.getRocketPoolAddress()) throw;
        _;
    }

    /*** Events *************/

    event Mint(
        address indexed _to, 
        uint256 value
    );

    event Burn(
        address indexed _owner, 
        uint256 value
    );

    event Deposit(
        address indexed _sender, 
        uint256 value,
        uint256 now
    );

    event FlagUint (
        uint256 flag
    );


    /*** Methods *************/
   
    /// @dev constructor
    function RocketDepositToken(address deployedRocketHubAddress) {
        // Address of the main RocketHub contract, should never need updating
        rocketHubAddress = deployedRocketHubAddress;
    }

    /// @notice Send `msg.value ether` Eth from the account of `message.caller.address()`, to the Rocket Pool Deposit Token fund at `to.address()`.
    /// @dev Fallback function, receives ether from minipools representing outstanding deposit tokens
    function() public payable {   
        // Deposited from a minipool (most likely, anyone can seed the fund)
        Deposit(msg.sender, msg.value, now);
    }

    /**
    * @dev Mint the Rocket Deposit Tokens
    * @param _to The address that will recieve the minted tokens.
    * @param _amount The amount of tokens to mint.
    * @return A boolean that indicates if the operation was successful.
    */
    function mint(address _to, uint _amount) onlyLatestRocketPool returns (bool) {
        // Verify ok
        if(_amount > 0 && (balances[_to] + _amount) > balances[_to]) {
            totalSupply += _amount;
            balances[_to] += _amount;
            Mint(_to, _amount);
            return true;
        }
        return false;
    }

    /**
    * @dev Burn these tokens when they are returned to Rocket Pool in exhange for ether
    * @param _amount The amount of tokens
    * @return A boolean that indicates if the operation was successful.
    */
    function burnTokensForEther(uint256 _amount) returns (bool success) {
        // Check to see if we have enough returned token withdrawal deposits from the minipools to cover this trade
        if(this.balance < _amount) {
            throw;       
        }
        // Get the hub
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        // Rocket settings
        RocketSettingsInterface rocketSettings = RocketSettingsInterface(rocketHub.getRocketSettingsAddress());
        // Now send ether to the user in return for the tokens
        if(balances[msg.sender] >= _amount  && _amount > 0) {
            // Subtract from the sender
            balances[msg.sender] -= _amount;    
            // Updates totalSupply                  
            totalSupply -= _amount;    
            // Now add the fee the original seller made to withdraw back onto the ether amount for the person burning the tokens
            uint256 etherWithdrawAmountPlusBonus = _amount + Arithmetic.overflowResistantFraction(rocketSettings.getDepositTokenWithdrawalFeePercInWei(), _amount, calcBase);
            FlagUint(etherWithdrawAmountPlusBonus);
            return false;
            // Did it send ok?
            if (!msg.sender.send(etherWithdrawAmountPlusBonus)) {
                // Add back to the sender
                balances[msg.sender] += _amount;    
                // Updates totalSupply                  
                totalSupply += _amount;    
                // Fail
                return false;
            }else{
                // Fire the event now                         
                Burn(msg.sender, _amount);
                // Success
                return true;
            }
        }
        return false;
    }

    /**
    * @dev The current total supply in circulation
    * @return A uint256 that indicates the total supply currently
    */
    function totalSupply() constant returns (uint256 totalSupply) {
        return totalSupply;
    }

    /**
    * @dev The balance of a particular account
    * @param _owner The address that will check the balance of
    * @return The users balance in uint256.
    */
    function balanceOf(address _owner) constant returns (uint256 balance) {
        return balances[_owner];
    }
  
    /**
    * @dev Transfer the balance from owner's account to another account
    * @param _to The address that will receive the token
    * @param _amount The amount to transfer
    * @return A boolean that indicates if the operation was successful.
    */
    function transfer(address _to, uint256 _amount) returns (bool success) {
        // Verify ok
        if (balances[msg.sender] >= _amount  && _amount > 0  && (balances[_to] + _amount) > balances[_to]) {            
            balances[msg.sender] -= _amount;
            balances[_to] += _amount;
            return true;
        } else {
           return false;
        }
    }

    /**
    * @dev Transfer from one account to another
    * @param _from The address that will send the token
    * @param _to The address that will receive the token
    * @param _amount The amount to transfer
    * @return A boolean that indicates if the operation was successful.
    */
    function transferFrom(address _from, address _to, uint256 _amount) returns (bool success) {
        // Verify ok
        if (balances[_from] >= _amount && allowed[_from][msg.sender] >= _amount && _amount > 0 && (balances[_to] + _amount) > balances[_to]) {
                balances[_from] -= _amount;
                allowed[_from][msg.sender] -= _amount;
                balances[_to] += _amount;
                return true;
            } else {
                return false;
            }
        }


    /**
    * @dev Allow _spender to withdraw from your account, multiple times, up to the _value amount. If this function is called again it overwrites the current allowance with _value.
    * @param _spender The address that will have access to spend these tokens
    * @param _amount The amount to transfer
    * @return A boolean that indicates if the operation was successful.
    */
    function approve(address _spender, uint256 _amount) returns (bool success) {
        allowed[msg.sender][_spender] = _amount;
        return true;
    }

    /**
    * @dev Returns the allowance for that owner/spender relationship
    * @param _owner The address that owns these tokens
    * @param _spender The address that will have access to spend these tokens
    * @return A uint256 number showing the remaining balance
    */
    function allowance(address _owner, address _spender) constant returns (uint256 remaining) {
        return allowed[_owner][_spender];
    }


       
}
