pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../RocketBase.sol";
//import "../../interface/token/RocketTokenNETHInterface.sol";

// RPL Governance and utility token
// Inlfationary with rate determined by DAO

contract RocketTokenRPL is RocketBase, ERC20 {

    /**** Properties ***********/

    /**** Contracts ************/

    // The address of our fixed supply RPL ERC20 token contract
    IERC20 rplFixedSupplyContract = IERC20(address(0));       

    /**** Events ***********/
    
    event RPLFixedSupplyBurn(address indexed from, uint256 amount, uint256 time);

    // Construct
    constructor(address _rocketStorageAddress, address _rocketTokenRPLFixedSupplyAddress) RocketBase(_rocketStorageAddress) ERC20("Rocket Pool", "RPL") public {
        // Version
        version = 1;
        // Set the mainnet RPL fixed supply token address
        rplFixedSupplyContract = IERC20(_rocketTokenRPLFixedSupplyAddress);
    }

    // Swap current RPL fixed supply tokens for new RPL 1:1 to the same address from the user calling it
    function swapMyTokens(uint256 _amount) external {
        // Valid amount?
        require(_amount > 0, "Please enter valid amount of RPL to swap");
        // Check they have a valid amount to swap from
        require(rplFixedSupplyContract.balanceOf(address(msg.sender)) > 0, "No existing RPL fixed supply tokens available to swap");
        // Check they can cover the amount
        require(rplFixedSupplyContract.balanceOf(address(msg.sender)) <= _amount, "Not enough RPL fixed supply tokens available to cover swap desired amount");
        // Check address are legit (impossible, but safety first)
        require(msg.sender != address(0x0), "Sender address is not a valid address");
        // Send the tokens to this contract now and mint new ones for them
        if (rplFixedSupplyContract.transfer(address(this), _amount)) {
            // Now mint new RPL for them and increase supply
            _mint(msg.sender, _amount);
            // Log it
            emit RPLFixedSupplyBurn(msg.sender, _amount, now);
        }else{
            revert("Token transfer from existing RPL contract was not successful");
        }
    }


}
