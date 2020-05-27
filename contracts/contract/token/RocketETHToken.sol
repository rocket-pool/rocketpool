pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "./StandardToken.sol";
import "../../interface/RocketPoolInterface.sol";

// rETH is a tokenized stake in the Rocket Pool network
// rETH is backed by ETH (subject to liquidity) at a variable exchange rate

contract RocketETHToken is RocketBase, StandardToken {

    // Libs
    using SafeMath for uint;

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Get the current ETH : rETH exchange rate
    // Returns the amount of ETH backing 1 rETH
    function getExchangeRate() public view returns (uint256) {
        // Get network total ETH balance
        RocketPoolInterface rocketPool = RocketPoolInterface(getContractAddress("rocketPool"));
        uint256 totalEthBalance = rocketPool.getTotalETHBalance();
        // Calculate exchange rate
        uint256 calcBase = 1 ether;
        if (totalSupply == 0) { return calcBase; }
        return calcBase.mul(totalEthBalance).div(totalSupply);
    }

    // Mint rETH
    // Only accepts calls from the RocketDepositPool contract
    function mint(uint256 _amount, address _to) external {
        // Check amount
        require(_amount > 0, "Invalid token mint amount");
        // Update balance & supply
        balances[_to] = balances[_to].add(_amount);
        totalSupply = totalSupply.add(_amount);
    }

    // Burn rETH for ETH
    function burn(uint256 _amount) external {
        // 1. Calculate ETH amount and check contract ETH balance
        // 2. Decrease total supply and account balance
        // 3. Update the RP network total ETH balance
        // 4. Transfer ETH to account
    }

}
