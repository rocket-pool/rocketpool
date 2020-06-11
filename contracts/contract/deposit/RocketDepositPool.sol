pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/RocketVaultInterface.sol";
import "../../interface/deposit/RocketDepositPoolInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolQueueInterface.sol";
import "../../interface/network/RocketNetworkBalancesInterface.sol";
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
    function getBalance() override public view returns (uint256) {
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
        RocketNetworkBalancesInterface rocketNetworkBalances = RocketNetworkBalancesInterface(getContractAddress("rocketNetworkBalances"));
        // Check deposit settings
        require(rocketDepositSettings.getDepositEnabled(), "Deposits into Rocket Pool are currently disabled");
        require(msg.value >= rocketDepositSettings.getMinimumDeposit(), "The deposited amount is less than the minimum deposit size");
        // Calculate amount of rETH to mint
        uint256 rethExchangeRate = rocketETHToken.getExchangeRate();
        uint256 rethAmount;
        if (rethExchangeRate == 0) { rethAmount = msg.value; }
        else { rethAmount = calcBase.mul(msg.value).div(rethExchangeRate); }
        // Mint rETH to user account
        rocketETHToken.mint(rethAmount, msg.sender);
        // Update network ETH balance
        // MUST be done *after* rETH amount calculation
        rocketNetworkBalances.increaseTotalETHBalance(msg.value);
        // Process deposit
        processDeposit();
    }

    // Recycle a deposit from a dissolved minipool
    // Only accepts calls from registered minipools
    function recycleDissolvedDeposit() override external payable onlyRegisteredMinipool(msg.sender) { processDeposit(); }

    // Recycle a deposit from a withdrawn minipool
    // Only accepts calls from the RocketNetworkWithdrawal contract
    function recycleWithdrawnDeposit() override external payable onlyLatestContract("rocketNetworkWithdrawal", msg.sender) { processDeposit(); }

    // Process a deposit
    function processDeposit() private {
        // Load contracts
        RocketDepositSettingsInterface rocketDepositSettings = RocketDepositSettingsInterface(getContractAddress("rocketDepositSettings"));
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        // Update deposit pool balance
        setBalance(getBalance().add(msg.value));
        // Transfer ETH to vault
        rocketVault.depositEther{value: msg.value}();
        // Assign deposits if enabled
        if (rocketDepositSettings.getAssignDepositsEnabled()) { assignDeposits(); }
    }

    // Assign deposits to available minipools
    function assignDeposits() override public {
        // Load contracts
        RocketDepositSettingsInterface rocketDepositSettings = RocketDepositSettingsInterface(getContractAddress("rocketDepositSettings"));
        RocketMinipoolQueueInterface rocketMinipoolQueue = RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue"));
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        // Check deposit settings
        require(rocketDepositSettings.getAssignDepositsEnabled(), "Deposit assignments are currently disabled");
        // Assign deposits
        for (uint256 i = 0; i < rocketDepositSettings.getMaximumDepositAssignments(); ++i) {
            // Get & check next available minipool capacity
            uint256 minipoolCapacity = rocketMinipoolQueue.getNextCapacity();
            if (minipoolCapacity == 0 || getBalance() < minipoolCapacity) { break; }
            // Dequeue next available minipool
            address minipoolAddress = rocketMinipoolQueue.dequeueMinipool();
            RocketMinipoolInterface minipool = RocketMinipoolInterface(minipoolAddress);
            // Update deposit pool balance
            setBalance(getBalance().sub(minipoolCapacity));
            // Withdraw ETH from vault
            rocketVault.withdrawEther(address(this), minipoolCapacity);
            // Assign deposit to minipool
            minipool.userDeposit{value: minipoolCapacity}();
        }
    }

}
