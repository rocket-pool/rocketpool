pragma solidity 0.6.8;

// rETH is a tokenized stake in the Rocket Pool network
// rETH is backed by ETH (subject to liquidity) at a variable exchange rate

contract RocketETHToken {

    // Various ERC20 methods

    // Get the current rETH : ETH exchange rate
    function getExchangeRate() public {
        // Total RP network ETH balance / total rETH supply
    }

    // Mint rETH
    // Only accepts calls from the RocketDeposit and RocketMinipool contracts
    function mint(uint256 _amount, address _to) public {}

    // Burn rETH for ETH
    function burn(uint256 _amount) public {}

}
