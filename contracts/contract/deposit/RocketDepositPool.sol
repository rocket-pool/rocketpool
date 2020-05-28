pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/RocketPoolInterface.sol";
import "../../interface/RocketVaultInterface.sol";
import "../../interface/node/RocketNodeRewardsInterface.sol";
import "../../interface/settings/RocketDepositSettingsInterface.sol";
import "../../interface/token/RocketETHTokenInterface.sol";
import "../../lib/SafeMath.sol";

// The main entry point for deposits into the RP network
// Accepts user deposits and mints rETH; fees are deducted and the remainder is sent to the user
// Handles assignment of deposited ETH to minipools

contract RocketDepositPool is RocketBase {

    // Libs
    using SafeMath for uint;

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Current deposit pool balance
    function getBalance() public view returns (uint256) {
        return getUintS("deposit.pool.balance");
    }
    function setBalance(uint256 _value) private {
        setUintS("deposit.pool.balance", _value);
    }

    // Accept a deposit from a user
    function deposit() external payable {
        // Calculation base value
        uint256 calcBase = 1 ether;
        // Load contracts
        RocketDepositSettingsInterface rocketDepositSettings = RocketDepositSettingsInterface(getContractAddress("rocketDepositSettings"));
        RocketETHTokenInterface rocketETHToken = RocketETHTokenInterface(getContractAddress("rocketETHToken"));
        RocketNodeRewardsInterface rocketNodeRewards = RocketNodeRewardsInterface(getContractAddress("rocketNodeRewards"));
        RocketPoolInterface rocketPool = RocketPoolInterface(getContractAddress("rocketPool"));
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        // Check deposit settings
        require(rocketDepositSettings.getDepositEnabled(), "Deposits into Rocket Pool are currently disabled");
        require(msg.value >= rocketDepositSettings.getMinimumDeposit(), "The deposited amount is less than the minimum deposit size");
        // Update deposit pool balance
        setBalance(getBalance().add(msg.value));
        // Calculate amount of rETH to mint
        uint256 rethExchangeRate = rocketETHToken.getExchangeRate();
        uint256 rethAmount;
        if (rethExchangeRate == 0) { rethAmount = msg.value; }
        else { rethAmount = calcBase.mul(msg.value).div(rethExchangeRate); }
        // Mint rETH here
        rocketETHToken.mint(rethAmount, address(this));
        // Update network ETH balance
        rocketPool.increaseTotalETHBalance(msg.value);
        // Calculate deposit fee amount and user share of rETH
        uint256 feeAmount = rethAmount.mul(rocketDepositSettings.getDepositFee()).div(calcBase);
        uint256 userAmount = rethAmount.sub(feeAmount);
        // Transfer rETH to vault & user
        require(rocketETHToken.transfer(address(rocketVault), feeAmount), "rETH was not transferred to the vault successfully");
        require(rocketETHToken.transfer(msg.sender, userAmount), "rETH was not transferred to the user successfully");
        // Update node reward pool balance
        rocketNodeRewards.increaseBalance(feeAmount);
        // Transfer ETH to vault
        rocketVault.depositEther{value: msg.value}();
        // Assign deposits
        assignDeposits();
    }

    // Recycle a deposit from a withdrawn minipool
    // Only accepts calls from the RocketPool contract
    function recycleDeposit() external payable onlyLatestContract("rocketPool", msg.sender) {
        // 1. Transfer ETH to the vault
        // 2. Assign deposits
    }

    // Assign deposits to available minipools
    function assignDeposits() public {
        // Repeat N times:
        // 1. Check there is an available minipool and >= 16 ETH in deposits
        // 2. Select a pseudo-random minipool from the available set
        // 3. Transfer 16 ETH from the deposit vault to the minipool
    }

}
