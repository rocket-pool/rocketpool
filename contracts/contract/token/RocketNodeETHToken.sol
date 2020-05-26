pragma solidity 0.6.8;

// nETH is paid to node operators when their eth 2.0 validators become withdrawable
// nETH is backed by ETH (subject to liquidity) 1:1
// nETH will be replaced by direct BETH payments after eth 2.0 phase 2

contract RocketNodeETHToken {

    // Various ERC20 methods

    // Mint nETH
    // Only accepts calls from the RocketMinipoolManager contract
    function mint(uint256 _amount, address _to) public {}

    // Burn nETH for ETH
    function burn(uint256 _amount) public {
        // 1. Check contract ETH balance
        // 2. Decrease total supply and account balance
        // 3. Transfer ETH to account
    }

}
