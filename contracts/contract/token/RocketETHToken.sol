pragma solidity 0.5.8;


import "../../RocketBase.sol";
import "./StandardToken.sol";


contract RocketETHToken is StandardToken, RocketBase {


    /**** Properties ************/


    string public name = "Rocket Pool ETH";
    string public symbol = "rETH";
    string public version = "1.0";
    uint8 public constant decimals = 18;
    uint256 public totalSupply = 0;


    /*** Events *****************/


    event Mint(
        address indexed _to,
        uint256 value,
        uint256 created
    );

    event Burn(
        address indexed _owner,
        uint256 value,
        uint256 created
    );

    event Deposit(
        address indexed _sender,
        uint256 value,
        uint256 created
    );


    /*** Modifiers **************/


    // Sender must be RocketNodeWatchtower or RocketDeposit contract
    modifier onlyNodeWatchtowerOrDeposit() {
        require(
            msg.sender == rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketNodeWatchtower"))) ||
            msg.sender == rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketDeposit"))),
            "Sender is not a super user or RocketDeposit"
        );
        _;
    }


    /*** Methods ****************/


    /// @dev RocketETHToken constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {}


    /// @dev Fallback payable function, receives ether from beacon chain withdrawals
    function() external payable {
        emit Deposit(msg.sender, msg.value, now);
    }


    /**
     * @dev Mint rETH Tokens
     * @param _to The address that will recieve the minted tokens
     * @param _amount The amount of tokens to mint
     * @return A boolean that indicates if the operation was successful
     */
    function mint(address _to, uint256 _amount) public onlyNodeWatchtowerOrDeposit returns (bool) {
        // Check burn amount
        require(_amount > 0, "Invalid token mint amount");
        // Mint tokens
        balances[_to] = balances[_to].add(_amount);
        // Update total token supply
        totalSupply = totalSupply.add(_amount);
        // Fire mint event
        emit Mint(_to, _amount, now);
        // Success
        return true;
    }


    /**
     * @dev Burn rETH tokens in exchange for ether
     * @param _amount The amount of tokens to burn
     * @return A boolean that indicates if the operation was successful
     */
    function burnTokensForEther(uint256 _amount) public returns (bool) {
        // Check burn amount
        require(_amount > 0, "Invalid token burn amount");
        // Check sender's token balance
        require(balances[msg.sender] >= _amount, "Insufficient token balance");
        // Check contract ether balance
        require(address(this).balance >= _amount, "Insufficient ether balance for exchange");
        // Subtract tokens from sender's balance
        balances[msg.sender] = balances[msg.sender].sub(_amount);
        // Update total token supply
        totalSupply = totalSupply.sub(_amount);
        // Transfer the exchange amount to the sender
        msg.sender.transfer(_amount);
        // Fire burn event
        emit Burn(msg.sender, _amount, now);
        // Success
        return true;
    }


}
