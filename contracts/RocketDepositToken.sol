pragma solidity 0.4.18;


import "./RocketBase.sol";
import "./interface/ERC20.sol";
import "./interface/RocketStorageInterface.sol";
import "./interface/RocketSettingsInterface.sol";
import "./lib/SafeMath.sol";


/// @title The Rocket Pool Deposit Token - Can be used as a backing of your deposit and traded with others while staking
/// @author David Rugendyke
contract RocketDepositToken is ERC20, RocketBase {

    /**** Properties ***********/
    string public constant SYMBOL = "RPD";                              // Token symbol
    string public constant NAME = "Rocket Pool Deposit";                // Token name
    uint8 public constant DECIMALS = 18;                                // Decimal places

    uint256 public totalSupply = 0;                                     // Total supply
    mapping(address => uint256) private balances;                       // Balances for each account
    mapping(address => mapping (address => uint256)) private allowed;   // Owner of account approves the transfer of an amount to another account
    uint256 private calcBase = 1000000000000000000;                     // Use this as our base unit to remove the decimal place by multiplying and dividing by it since solidity doesn't support reals yet   


    /**** Libs *****************/
    
    using SafeMath for uint;


    /*** Modifiers *************/

    /// @dev Only allow access from the latest version of the RocketUser contract
    modifier onlyLatestRocketUser() {
        // Only allow access
        require(msg.sender == rocketStorage.getAddress(keccak256("contract.name", "rocketUser")));
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
        uint256 created
    );


    /*** Methods *************/
   
    /// @dev constructor
    function RocketDepositToken(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
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
    function mint(address _to, uint _amount) public onlyLatestRocketUser returns (bool) {
        // Verify ok
        if (_amount > 0) {
            totalSupply = totalSupply.add(_amount);
            balances[_to] = balances[_to].add(_amount);
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
    function burnTokensForEther(uint256 _amount) public returns (bool success) {
        // Check to see if we have enough returned token withdrawal deposits from the minipools to cover this trade
        require(this.balance >= _amount);
        // Check to see if the sender has a sufficient token balance and is burning some tokens
        require(balances[msg.sender] >= _amount && _amount > 0);
        // Rocket settings
        RocketSettingsInterface rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        // Now add the fee the original seller made to withdraw back onto the ether amount for the person burning the tokens
        uint256 etherWithdrawAmountPlusBonus = _amount.add(_amount.mul(rocketSettings.getTokenRPDWithdrawalFeePerc()) / calcBase);
        // Check to see if we have enough ether to cover the full withdrawal amount
        require(this.balance >= etherWithdrawAmountPlusBonus);
        // Subtract tokens from the sender's balance
        balances[msg.sender] = balances[msg.sender].sub(_amount);
        // Update total token supply
        totalSupply = totalSupply.sub(_amount);
        // Transfer the full withdrawal amount to the sender
        msg.sender.transfer(etherWithdrawAmountPlusBonus);
        // Fire Burn event
        Burn(msg.sender, _amount);
        // Success
        return true;
    }

    /**
    * @dev The current total supply in circulation
    * @return A uint256 that indicates the total supply currently
    */
    function totalSupply() public view returns (uint256) {
        return totalSupply;
    }

    /**
    * @dev The balance of a particular account
    * @param _owner The address that will check the balance of
    * @return The users balance in uint256.
    */
    function balanceOf(address _owner) public view returns (uint256 balance) {
        return balances[_owner];
    }
  
    /**
    * @dev Transfer the balance from owner's account to another account
    * @param _to The address that will receive the token
    * @param _amount The amount to transfer
    * @return A boolean that indicates if the operation was successful.
    */
    function transfer(address _to, uint256 _amount) public returns (bool success) {
        // Verify ok
        if (balances[msg.sender] >= _amount && _amount > 0) {            
            balances[msg.sender] = balances[msg.sender].sub(_amount);
            balances[_to] = balances[_to].add(_amount);
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
    function transferFrom(address _from, address _to, uint256 _amount) public returns (bool success) {
        // Verify ok
        if (balances[_from] >= _amount && allowed[_from][msg.sender] >= _amount && _amount > 0) {
            balances[_from] = balances[_from].sub(_amount);
            allowed[_from][msg.sender] = allowed[_from][msg.sender].sub(_amount);
            balances[_to] = balances[_to].add(_amount);
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
    function approve(address _spender, uint256 _amount) public returns (bool success) {
        allowed[msg.sender][_spender] = _amount;
        return true;
    }

    /**
    * @dev Returns the allowance for that owner/spender relationship
    * @param _owner The address that owns these tokens
    * @param _spender The address that will have access to spend these tokens
    * @return A uint256 number showing the remaining balance
    */
    function allowance(address _owner, address _spender) public view returns (uint256 remaining) {
        return allowed[_owner][_spender];
    }

}
