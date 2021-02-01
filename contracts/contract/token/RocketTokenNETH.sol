pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "../RocketBase.sol";
import "../../interface/token/RocketTokenNETHInterface.sol";

// nETH is paid to node operators when their eth 2.0 validators become withdrawable
// nETH is backed by ETH (subject to liquidity) 1:1
// nETH will be replaced by direct BETH payments after eth 2.0 phase 2

contract RocketTokenNETH is RocketBase, ERC20, RocketTokenNETHInterface {

    // Events
    event EtherDeposited(address indexed from, uint256 amount, uint256 time);
    event TokensMinted(address indexed to, uint256 amount, uint256 time);
    event TokensBurned(address indexed from, uint256 amount, uint256 time);

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress)  ERC20("Rocket Pool Node ETH", "nETH") {
        version = 1;
    }

    // Deposit ETH rewards
    // Only accepts calls from the RocketNetworkWithdrawal contract
    function depositRewards() override external payable onlyLatestContract("rocketNetworkWithdrawal", msg.sender) {
        // Emit ether deposited event
        emit EtherDeposited(msg.sender, msg.value, block.timestamp);
    }

    // Mint nETH
    // Only accepts calls from the RocketMinipoolStatus contract
    function mint(uint256 _amount, address _to) override external onlyLatestContract("rocketMinipoolStatus", msg.sender) {
        // Check amount
        require(_amount > 0, "Invalid token mint amount");
        // Update balance & supply
        _mint(_to, _amount);
        // Emit tokens minted event
        emit TokensMinted(_to, _amount, block.timestamp);
    }

    // Burn nETH for ETH
    function burn(uint256 _amount) override external {
        // Check amount
        require(_amount > 0, "Invalid token burn amount");
        require(balanceOf(msg.sender) >= _amount, "Insufficient nETH balance");
        // Check ETH balance
        require(address(this).balance >= _amount, "Insufficient ETH balance for exchange");
        // Update balance & supply
        _burn(msg.sender, _amount);
        // Transfer ETH to sender
        msg.sender.transfer(_amount);
        // Emit tokens burned event
        emit TokensBurned(msg.sender, _amount, block.timestamp);
    }

}
