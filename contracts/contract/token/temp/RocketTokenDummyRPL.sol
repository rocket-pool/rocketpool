pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";


/// @title Dummy Rocket Pool Token (RPL) contract (do not deploy to mainnet)
/// @author Jake Pospischil <jake@rocketpool.net>

contract RocketTokenDummyRPL is ERC20, Ownable {


    /**** Properties ***********/

    uint8 constant decimalPlaces = 18;
    uint256 constant public exponent = 10**uint256(decimalPlaces);
    uint256 constant public totalSupplyCap = 18.5 * (10**6) * exponent;    // 18 Million tokens


    /**** Libs *****************/
    
    using SafeMath for uint;


    /*** Events ****************/

    event MintToken(address _minter, address _address, uint256 _value);


    /**** Methods ***********/

    // Construct with our token details
    constructor(address _rocketStorageAddress) ERC20("Rocket Pool Dummy RPL", "DRPL") {}


    // @dev Mint the Rocket Pool Tokens (RPL)
    // @param _to The address that will receive the minted tokens.
    // @param _amount The amount of tokens to mint.
    // @return A boolean that indicates if the operation was successful.
    function mint(address _to, uint _amount) external onlyOwner returns (bool) {
        // Check token amount is positive
        require(_amount > 0);
        // Check we don't exceed the supply cap
        require(totalSupply().add(_amount) <= totalSupplyCap);
        // Mint tokens at address
        _mint(_to, _amount);
        // Fire mint token event
        emit MintToken(msg.sender, _to, _amount);
        // Return success flag
        return true;
    }


    /// @dev Returns the amount of tokens that can still be minted
    function getRemainingTokens() external view returns(uint256) {
        return totalSupplyCap.sub(totalSupply());
    }


}