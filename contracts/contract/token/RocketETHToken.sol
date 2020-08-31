pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "./StandardToken.sol";
import "../RocketBase.sol";
import "../../interface/deposit/RocketDepositPoolInterface.sol";
import "../../interface/network/RocketNetworkBalancesInterface.sol";
import "../../interface/token/RocketETHTokenInterface.sol";
import "../../lib/SafeMath.sol";

// rETH is a tokenized stake in the Rocket Pool network
// rETH is backed by ETH (subject to liquidity) at a variable exchange rate

contract RocketETHToken is RocketBase, StandardToken, RocketETHTokenInterface {

    // Libs
    using SafeMath for uint;

    // Events
    event EtherDeposited(address indexed from, uint256 amount, uint256 time);
    event TokensMinted(address indexed to, uint256 amount, uint256 ethAmount, uint256 time);
    event TokensBurned(address indexed from, uint256 amount, uint256 ethAmount, uint256 time);

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Calculate the amount of ETH backing an amount of rETH
    function getEthValue(uint256 _rethAmount) override public view returns (uint256) {
        // Get network balances
        RocketNetworkBalancesInterface rocketNetworkBalances = RocketNetworkBalancesInterface(getContractAddress("rocketNetworkBalances"));
        uint256 totalEthBalance = rocketNetworkBalances.getTotalETHBalance();
        uint256 rethSupply = rocketNetworkBalances.getTotalRETHSupply();
        // Use 1:1 ratio if no rETH is minted
        if (rethSupply == 0) { return _rethAmount; }
        // Calculate and return
        return _rethAmount.mul(totalEthBalance).div(rethSupply);
    }

    // Calculate the amount of rETH backed by an amount of ETH
    function getRethValue(uint256 _ethAmount) override public view returns (uint256) {
        // Get network balances
        RocketNetworkBalancesInterface rocketNetworkBalances = RocketNetworkBalancesInterface(getContractAddress("rocketNetworkBalances"));
        uint256 totalEthBalance = rocketNetworkBalances.getTotalETHBalance();
        uint256 rethSupply = rocketNetworkBalances.getTotalRETHSupply();
        // Use 1:1 ratio if no rETH is minted
        if (rethSupply == 0) { return _ethAmount; }
        // Check network ETH balance
        require(totalEthBalance > 0, "Cannot calculate rETH token amount while total network balance is zero");
        // Calculate and return
        return _ethAmount.mul(rethSupply).div(totalEthBalance);
    }

    // Get the current ETH : rETH exchange rate
    // Returns the amount of ETH backing 1 rETH
    function getExchangeRate() override public view returns (uint256) {
        return getEthValue(1 ether);
    }

    // Get the current ETH collateral rate
    // Returns the portion of rETH backed by ETH in the contract as a fraction of 1 ether
    function getCollateralRate() override public view returns (uint256) {
        uint256 calcBase = 1 ether;
        uint256 totalEthValue = getEthValue(totalSupply);
        if (totalEthValue == 0) { return calcBase; }
        return calcBase.mul(address(this).balance).div(totalEthValue);
    }

    // Deposit ETH rewards
    // Only accepts calls from the RocketNetworkWithdrawal contract
    function depositRewards() override external payable onlyLatestContract("rocketNetworkWithdrawal", msg.sender) {
        // Emit ether deposited event
        emit EtherDeposited(msg.sender, msg.value, now);
    }

    // Deposit excess ETH from deposit pool
    // Only accepts calls from the RocketDepositPool contract
    function depositExcess() override external payable onlyLatestContract("rocketDepositPool", msg.sender) {
        // Emit ether deposited event
        emit EtherDeposited(msg.sender, msg.value, now);
    }

    // Mint rETH
    // Only accepts calls from the RocketDepositPool contract
    function mint(uint256 _ethAmount, address _to) override external onlyLatestContract("rocketDepositPool", msg.sender) {
        // Get rETH amount
        uint256 rethAmount = getRethValue(_ethAmount);
        // Check rETH amount
        require(rethAmount > 0, "Invalid token mint amount");
        // Update balance & supply
        balances[_to] = balances[_to].add(rethAmount);
        totalSupply = totalSupply.add(rethAmount);
        // Emit tokens minted event
        emit TokensMinted(_to, rethAmount, _ethAmount, now);
    }

    // Burn rETH for ETH
    function burn(uint256 _rethAmount) override external {
        // Check rETH amount
        require(_rethAmount > 0, "Invalid token burn amount");
        require(balances[msg.sender] >= _rethAmount, "Insufficient rETH balance");
        // Get ETH amount
        uint256 ethAmount = getEthValue(_rethAmount);
        // Get & check ETH balance
        uint256 ethBalance = getTotalCollateral();
        require(ethBalance >= ethAmount, "Insufficient ETH balance for exchange");
        // Update balance & supply
        balances[msg.sender] = balances[msg.sender].sub(_rethAmount);
        totalSupply = totalSupply.sub(_rethAmount);
        // Withdraw ETH from deposit pool if required
        withdrawDepositCollateral(ethAmount);
        // Transfer ETH to sender
        msg.sender.transfer(ethAmount);
        // Emit tokens burned event
        emit TokensBurned(msg.sender, _rethAmount, ethAmount, now);
    }

    // Get the total amount of collateral available
    // Includes rETH contract balance & excess deposit pool balance
    function getTotalCollateral() private view returns (uint256) {
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        return rocketDepositPool.getExcessBalance().add(address(this).balance);
    }

    // Withdraw ETH from the deposit pool for collateral if required
    function withdrawDepositCollateral(uint256 _ethRequired) private {
        // Check rETH contract balance
        uint256 ethBalance = address(this).balance;
        if (ethBalance >= _ethRequired) { return; }
        // Withdraw
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        rocketDepositPool.withdrawExcessBalance(_ethRequired.sub(ethBalance));
    }

}
