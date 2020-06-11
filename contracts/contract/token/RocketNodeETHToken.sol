pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "./StandardToken.sol";
import "../RocketBase.sol";
import "../../interface/token/RocketNodeETHTokenInterface.sol";

// nETH is paid to node operators when their eth 2.0 validators become withdrawable
// nETH is backed by ETH (subject to liquidity) 1:1
// nETH will be replaced by direct BETH payments after eth 2.0 phase 2

contract RocketNodeETHToken is RocketBase, StandardToken, RocketNodeETHTokenInterface {

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Mint nETH
    // Only accepts calls from the RocketMinipoolStatus contract
    function mint(uint256 _amount, address _to) override external onlyLatestContract("rocketMinipoolStatus", msg.sender) {
        // Check amount
        require(_amount > 0, "Invalid token mint amount");
        // Update balance & supply
        balances[_to] = balances[_to].add(_amount);
        totalSupply = totalSupply.add(_amount);
    }

    // Burn nETH for ETH
    function burn(uint256 _amount) external {
        // TODO: implement
        // 1. Check contract ETH balance
        // 2. Decrease total supply and account balance
        // 3. Transfer ETH to account
    }

}
