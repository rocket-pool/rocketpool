pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/RocketPoolInterface.sol";
import "../../interface/RocketVaultInterface.sol";
import "../../interface/deposit/RocketDepositPoolInterface.sol";
import "../../interface/settings/RocketDepositSettingsInterface.sol";
import "../../interface/token/RocketETHTokenInterface.sol";
import "../../lib/SafeMath.sol";

// The main entry point for deposits into the RP network
// Accepts user deposits and mints rETH; handles assignment of deposited ETH to minipools

contract RocketDepositPool is RocketBase, RocketDepositPoolInterface {

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
        // Mint rETH to user account
        rocketETHToken.mint(rethAmount, msg.sender);
        // Update network ETH balance
        // MUST be done *after* rETH amount calculation
        rocketPool.increaseTotalETHBalance(msg.value);
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
