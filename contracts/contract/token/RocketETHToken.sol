pragma solidity 0.6.8;

// rETH is a tokenized stake in the Rocket Pool network
// rETH is backed by ETH (subject to liquidity) at a variable exchange rate

contract RocketETHToken {

    // Various ERC20 methods

    // Get the current rETH : ETH exchange rate
    function getExchangeRate() public {
        // RP network total ETH balance / total rETH supply
    }

    // Mint rETH
    // Only accepts calls from the RocketDepositPool contract
    function mint(uint256 _amount, address _to) public {}

    // Burn rETH for ETH
    function burn(uint256 _amount) public {
        // 1. Calculate ETH amount and check contract ETH balance
        // 2. Decrease total supply and account balance
        // 3. Update the RP network total ETH balance
        // 4. Transfer ETH to account
    }

}
