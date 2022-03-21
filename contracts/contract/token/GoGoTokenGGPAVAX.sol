pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "../RocketBase.sol";
import "../../interface/deposit/RocketDepositPoolInterface.sol";
import "../../interface/network/RocketNetworkBalancesInterface.sol";
import "../../interface/token/GoGoTokenGGPAVAXInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";

// ggpAVAX is a tokenised stake in the Rocket Pool network
// ggpAVAX is backed by ETH (subject to liquidity) at a variable exchange rate

contract GoGoTokenGGPAVAX is RocketBase, ERC20, GoGoTokenGGPAVAXInterface {

    // Libs
    using SafeMath for uint;

    // Events
    event EtherDeposited(address indexed from, uint256 amount, uint256 time);
    event TokensMinted(address indexed to, uint256 amount, uint256 ethAmount, uint256 time);
    event TokensBurned(address indexed from, uint256 amount, uint256 ethAmount, uint256 time);

    // Construct with our token details
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) ERC20("GoGoPool AVAX", "ggpAVAX") {
        // Version
        version = 1;
    }

    // Receive an ETH deposit from a minipool or generous individual
    receive() external payable {
        // Emit ether deposited event
        emit EtherDeposited(msg.sender, msg.value, block.timestamp);
    }

    // Calculate the amount of ETH backing an amount of ggpAVAX
    function getEthValue(uint256 _ggpavaxAmount) override public view returns (uint256) {
        // Get network balances
        RocketNetworkBalancesInterface rocketNetworkBalances = RocketNetworkBalancesInterface(getContractAddress("rocketNetworkBalances"));
        uint256 totalEthBalance = rocketNetworkBalances.getTotalETHBalance();
        uint256 ggpavaxSupply = rocketNetworkBalances.getTotalRETHSupply();
        // Use 1:1 ratio if no ggpAVAX is minted
        if (ggpavaxSupply == 0) { return _ggpavaxAmount; }
        // Calculate and return
        return _ggpavaxAmount.mul(totalEthBalance).div(ggpavaxSupply);
    }

    // Calculate the amount of ggpAVAX backed by an amount of ETH
    function getRethValue(uint256 _ethAmount) override public view returns (uint256) {
        // Get network balances
        RocketNetworkBalancesInterface rocketNetworkBalances = RocketNetworkBalancesInterface(getContractAddress("rocketNetworkBalances"));
        uint256 totalEthBalance = rocketNetworkBalances.getTotalETHBalance();
        uint256 ggpavaxSupply = rocketNetworkBalances.getTotalRETHSupply();
        // Use 1:1 ratio if no ggpAVAX is minted
        if (ggpavaxSupply == 0) { return _ethAmount; }
        // Check network ETH balance
        require(totalEthBalance > 0, "Cannot calculate ggpAVAX token amount while total network balance is zero");
        // Calculate and return
        return _ethAmount.mul(ggpavaxSupply).div(totalEthBalance);
    }

    // Get the current ETH : ggpAVAX exchange rate
    // Returns the amount of ETH backing 1 ggpAVAX
    function getExchangeRate() override external view returns (uint256) {
        return getEthValue(1 ether);
    }

    // Get the total amount of collateral available
    // Includes ggpAVAX contract balance & excess deposit pool balance
    function getTotalCollateral() override public view returns (uint256) {
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        return rocketDepositPool.getExcessBalance().add(address(this).balance);
    }

    // Get the current ETH collateral rate
    // Returns the portion of ggpAVAX backed by ETH in the contract as a fraction of 1 ether
    function getCollateralRate() override public view returns (uint256) {
        uint256 totalEthValue = getEthValue(totalSupply());
        if (totalEthValue == 0) { return calcBase; }
        return calcBase.mul(address(this).balance).div(totalEthValue);
    }

    // Deposit excess ETH from deposit pool
    // Only accepts calls from the RocketDepositPool contract
    function depositExcess() override external payable onlyLatestContract("rocketDepositPool", msg.sender) {
        // Emit ether deposited event
        emit EtherDeposited(msg.sender, msg.value, block.timestamp);
    }

    // Mint ggpAVAX
    // Only accepts calls from the RocketDepositPool contract
    function mint(uint256 _ethAmount, address _to) override external onlyLatestContract("rocketDepositPool", msg.sender) {
        // Get ggpAVAX amount
        uint256 ggpavaxAmount = getRethValue(_ethAmount);
        // Check ggpAVAX amount
        require(ggpavaxAmount > 0, "Invalid token mint amount");
        // Update balance & supply
        _mint(_to, ggpavaxAmount);
        // Emit tokens minted event
        emit TokensMinted(_to, ggpavaxAmount, _ethAmount, block.timestamp);
    }

    // Burn ggpAVAX for ETH
    function burn(uint256 _ggpavaxAmount) override external {
        // Check ggpAVAX amount
        require(_ggpavaxAmount > 0, "Invalid token burn amount");
        require(balanceOf(msg.sender) >= _ggpavaxAmount, "Insufficient ggpAVAX balance");
        // Get ETH amount
        uint256 ethAmount = getEthValue(_ggpavaxAmount);
        // Get & check ETH balance
        uint256 ethBalance = getTotalCollateral();
        require(ethBalance >= ethAmount, "Insufficient ETH balance for exchange");
        // Update balance & supply
        _burn(msg.sender, _ggpavaxAmount);
        // Withdraw ETH from deposit pool if required
        withdrawDepositCollateral(ethAmount);
        // Transfer ETH to sender
        msg.sender.transfer(ethAmount);
        // Emit tokens burned event
        emit TokensBurned(msg.sender, _ggpavaxAmount, ethAmount, block.timestamp);
    }

    // Withdraw ETH from the deposit pool for collateral if required
    function withdrawDepositCollateral(uint256 _ethRequired) private {
        // Check ggpAVAX contract balance
        uint256 ethBalance = address(this).balance;
        if (ethBalance >= _ethRequired) { return; }
        // Withdraw
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        rocketDepositPool.withdrawExcessBalance(_ethRequired.sub(ethBalance));
    }

    // Sends any excess ETH from this contract to the deposit pool (as determined by target collateral rate)
    function depositExcessCollateral() external override {
        // Load contracts
        RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        // Get collateral and target collateral rate
        uint256 collateralRate = getCollateralRate();
        uint256 targetCollateralRate = rocketDAOProtocolSettingsNetwork.getTargetRethCollateralRate();
        // Check if we are in excess
        if (collateralRate > targetCollateralRate) {
            // Calculate our target collateral in ETH
            uint256 targetCollateral = address(this).balance.mul(targetCollateralRate).div(collateralRate);
            // If we have excess
            if (address(this).balance > targetCollateral) {
                // Send that excess to deposit pool
                uint256 excessCollateral = address(this).balance.sub(targetCollateral);
                rocketDepositPool.recycleExcessCollateral{value: excessCollateral}();
            }
        }
    }

    // This is called by the base ERC20 contract before all transfer, mint, and burns
    function _beforeTokenTransfer(address from, address, uint256) internal override {
        // Don't run check if this is a mint transaction
        if (from != address(0)) {
            // Check which block the user's last deposit was
            bytes32 key = keccak256(abi.encodePacked("user.deposit.block", from));
            uint256 lastDepositBlock = getUint(key);
            if (lastDepositBlock > 0) {
                // Ensure enough blocks have passed
                uint256 depositDelay = getUint(keccak256(abi.encodePacked(keccak256("dao.protocol.setting.network"), "network.ggpavax.deposit.delay")));
                uint256 blocksPassed = block.number.sub(lastDepositBlock);
                require(blocksPassed > depositDelay, "Not enough time has passed since deposit");
                // Clear the state as it's no longer necessary to check this until another deposit is made
                deleteUint(key);
            }
        }
    }
}
