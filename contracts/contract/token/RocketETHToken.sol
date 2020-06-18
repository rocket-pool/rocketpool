pragma solidity 0.6.10;

// SPDX-License-Identifier: GPL-3.0-only

import "./StandardToken.sol";
import "../RocketBase.sol";
import "../../interface/network/RocketNetworkBalancesInterface.sol";
import "../../interface/token/RocketETHTokenInterface.sol";

// rETH is a tokenized stake in the Rocket Pool network
// rETH is backed by ETH (subject to liquidity) at a variable exchange rate

contract RocketETHToken is RocketBase, StandardToken, RocketETHTokenInterface {

    // Events
    event EtherDeposited(address indexed from, uint256 amount, uint256 time);
    event TokensMinted(address indexed to, uint256 amount, uint256 time);
    event TokensBurned(address indexed from, uint256 amount, uint256 ethAmount, uint256 time);

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Get the current ETH : rETH exchange rate
    // Returns the amount of ETH backing 1 rETH
    function getExchangeRate() override public view returns (uint256) {
        // Get network total ETH balance
        RocketNetworkBalancesInterface rocketNetworkBalances = RocketNetworkBalancesInterface(getContractAddress("rocketNetworkBalances"));
        uint256 totalEthBalance = rocketNetworkBalances.getTotalETHBalance();
        // Calculate exchange rate
        uint256 calcBase = 1 ether;
        if (totalSupply == 0) { return calcBase; }
        return calcBase.mul(totalEthBalance).div(totalSupply);
    }

    // Get the current ETH collateral rate
    // Returns the portion of rETH backed by ETH in the contract as a fraction of 1 ether
    function getCollateralRate() override public view returns (uint256) {
        uint256 calcBase = 1 ether;
        uint256 totalEthValue = totalSupply.mul(getExchangeRate()).div(calcBase);
        if (totalEthValue == 0) { return calcBase; }
        return calcBase.mul(address(this).balance).div(totalEthValue);
    }

    // Deposit ETH
    // Only accepts calls from the RocketNetworkWithdrawal contract
    function deposit() override external payable onlyLatestContract("rocketNetworkWithdrawal", msg.sender) {
        // Emit ether deposited event
        emit EtherDeposited(msg.sender, msg.value, now);
    }

    // Mint rETH
    // Only accepts calls from the RocketDepositPool contract
    function mint(uint256 _amount, address _to) override external onlyLatestContract("rocketDepositPool", msg.sender) {
        // Check amount
        require(_amount > 0, "Invalid token mint amount");
        // Update balance & supply
        balances[_to] = balances[_to].add(_amount);
        totalSupply = totalSupply.add(_amount);
        // Emit tokens minted event
        emit TokensMinted(_to, _amount, now);
    }

    // Burn rETH for ETH
    function burn(uint256 _amount) override external {
        // Check amount
        require(_amount > 0, "Invalid token burn amount");
        require(balances[msg.sender] >= _amount, "Insufficient rETH balance");
        // Calculate ETH amount
        uint256 calcBase = 1 ether;
        uint256 ethAmount = _amount.mul(getExchangeRate()).div(calcBase);
        // Check ETH balance
        require(address(this).balance >= ethAmount, "Insufficient ETH balance for exchange");
        // Load contracts
        RocketNetworkBalancesInterface rocketNetworkBalances = RocketNetworkBalancesInterface(getContractAddress("rocketNetworkBalances"));
        // Update balance & supply
        balances[msg.sender] = balances[msg.sender].sub(_amount);
        totalSupply = totalSupply.sub(_amount);
        // Update network ETH balance
        rocketNetworkBalances.decreaseTotalETHBalance(ethAmount);
        // Transfer ETH to sender
        msg.sender.transfer(ethAmount);
        // Emit tokens burned event
        emit TokensBurned(msg.sender, _amount, ethAmount, now);
    }

}
