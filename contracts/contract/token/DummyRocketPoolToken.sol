pragma solidity 0.5.8;


import "../utils/Ownable.sol";
import "./StandardToken.sol";
import "../../lib/SafeMath.sol";


/// @title Dummy Rocket Pool Token (RPL) contract
/// @author Jake Pospischil <jake@rocketpool.net>

contract DummyRocketPoolToken is StandardToken, Ownable {


    /**** Properties ***********/

    string public name = "Rocket Pool";
    string public symbol = "RPL";
    string public version = "1.0";
    uint8 public constant decimals = 18;
    uint256 public exponent = 10**uint256(decimals);
    uint256 public totalSupply = 0;                             // The current total supply
    uint256 public totalSupplyCap = 18 * (10**6) * exponent;    // 18 Million tokens


    /**** Libs *****************/
    
    using SafeMath for uint;


    /*** Events ****************/

    event MintToken(address _minter, address _address, uint256 _value);


    /**** Methods ***********/


    // @dev Mint the Rocket Pool Tokens (RPL)
    // @param _to The address that will receive the minted tokens.
    // @param _amount The amount of tokens to mint.
    // @return A boolean that indicates if the operation was successful.
    function mint(address _to, uint _amount) public onlyOwner returns (bool) {
        // Check token amount is positive
        require(_amount > 0);
        // Check we don't exceed the supply cap
        require(totalSupply.add(_amount) <= totalSupplyCap);
        // Mint tokens at address
        balances[_to] = balances[_to].add(_amount);
        // Increase the current total supply
        totalSupply = totalSupply.add(_amount);
        // Fire mint token event
        emit MintToken(msg.sender, _to, _amount);
        // Return success flag
        return true;
    }


    /// @dev Returns the amount of tokens that can still be minted
    function getRemainingTokens() public view returns(uint256) {
        return totalSupplyCap.sub(totalSupply);
    }


}
