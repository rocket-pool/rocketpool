pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/network/RocketNetworkPricesInterface.sol";
import "../../interface/node/RocketNodeStakingInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsRewardsInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol";
import "../../interface/RocketVaultInterface.sol";

// Handles node deposits and minipool creation

contract RocketNodeStaking is RocketBase, RocketNodeStakingInterface {

    // Libs
    using SafeMath for uint;

    // Events
    event RPLStaked(address indexed from, uint256 amount, uint256 time);
    event RPLWithdrawn(address indexed to, uint256 amount, uint256 time);
    event RPLSlashed(address indexed node, uint256 amount, uint256 ethValue, uint256 time);

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    // Get/set the total RPL stake amount
    function getTotalRPLStake() override public view returns (uint256) {
        return getUintS("rpl.staked.total.amount");
    }
    function setTotalRPLStake(uint256 _amount) private {
        setUintS("rpl.staked.total.amount", _amount);
    }
    function increaseTotalRPLStake(uint256 _amount) private {
        setTotalRPLStake(getTotalRPLStake().add(_amount));
    }
    function decreaseTotalRPLStake(uint256 _amount) private {
        setTotalRPLStake(getTotalRPLStake().sub(_amount));
    }

    // Get/set a node's RPL stake amount
    function getNodeRPLStake(address _nodeAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("rpl.staked.node.amount", _nodeAddress)));
    }
    function setNodeRPLStake(address _nodeAddress, uint256 _amount) private {
        setUint(keccak256(abi.encodePacked("rpl.staked.node.amount", _nodeAddress)), _amount);
    }
    function increaseNodeRPLStake(address _nodeAddress, uint256 _amount) private {
        setNodeRPLStake(_nodeAddress, getNodeRPLStake(_nodeAddress).add(_amount));
    }
    function decreaseNodeRPLStake(address _nodeAddress, uint256 _amount) private {
        setNodeRPLStake(_nodeAddress, getNodeRPLStake(_nodeAddress).sub(_amount));
    }

    // Get/set the block a node last staked RPL at
    function getNodeRPLStakedBlock(address _nodeAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("rpl.staked.node.block", _nodeAddress)));
    }
    function setNodeRPLStakedBlock(address _nodeAddress, uint256 _block) private {
        setUint(keccak256(abi.encodePacked("rpl.staked.node.block", _nodeAddress)), _block);
    }

    // Get the total effective RPL stake amount
    function getTotalEffectiveRPLStake() override public view returns (uint256) {
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Get current total RPL stake
        uint256 rplStake = getTotalRPLStake();
        // Calculate maximum total RPL stake
        uint256 maxRplStake = rocketMinipoolSettings.getHalfDepositUserAmount()
            .mul(rocketDAOProtocolSettingsNode.getMaximumPerMinipoolStake())
            .mul(rocketMinipoolManager.getMinipoolCount())
            .div(rocketNetworkPrices.getRPLPrice());
        // Return effective stake amount
        if (rplStake < maxRplStake) { return rplStake; }
        else { return maxRplStake; }
    }

    // Get a node's effective RPL stake amount
    function getNodeEffectiveRPLStake(address _nodeAddress) override public view returns (uint256) {
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Get node's current RPL stake
        uint256 rplStake = getNodeRPLStake(_nodeAddress);
        // Calculate node's maximum RPL stake
        uint256 maxRplStake = rocketMinipoolSettings.getHalfDepositUserAmount()
            .mul(rocketDAOProtocolSettingsNode.getMaximumPerMinipoolStake())
            .mul(rocketMinipoolManager.getNodeMinipoolCount(_nodeAddress))
            .div(rocketNetworkPrices.getRPLPrice());
        // Return effective stake amount
        if (rplStake < maxRplStake) { return rplStake; }
        else { return maxRplStake; }
    }

    // Get a node's minipool limit based on RPL stake
    function getNodeMinipoolLimit(address _nodeAddress) override public view returns (uint256) {
        // Load contracts
        RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Calculate & return minipool limit
        return getNodeRPLStake(_nodeAddress)
            .mul(rocketNetworkPrices.getRPLPrice())
            .div(
                rocketMinipoolSettings.getHalfDepositUserAmount()
                .mul(rocketDAOProtocolSettingsNode.getMinimumPerMinipoolStake())
            );
    }

    // Accept an RPL stake
    // Only accepts calls from registered nodes
    function stakeRPL(uint256 _amount) override external onlyLatestContract("rocketNodeStaking", address(this)) onlyRegisteredNode(msg.sender) {
        // Load contracts
        address rplTokenAddress = getContractAddress("rocketTokenRPL");
        address rocketVaultAddress = getContractAddress("rocketVault");
        IERC20 rplToken = IERC20(rplTokenAddress);
        RocketVaultInterface rocketVault = RocketVaultInterface(rocketVaultAddress);
        // Transfer RPL tokens
        require(rplToken.transferFrom(msg.sender, address(this), _amount), "Could not transfer RPL to staking contract");
        // Deposit RPL tokens to vault
        require(rplToken.approve(rocketVaultAddress, _amount), "Could not approve vault RPL deposit");
        rocketVault.depositToken("rocketNodeStaking", rplTokenAddress, _amount);
        // Update RPL stake amounts & node RPL staked block
        increaseTotalRPLStake(_amount);
        increaseNodeRPLStake(msg.sender, _amount);
        setNodeRPLStakedBlock(msg.sender, block.number);
        // Emit RPL staked event
        emit RPLStaked(msg.sender, _amount, block.timestamp);
    }

    // Withdraw staked RPL back to the node account
    // Only accepts calls from registered nodes
    function withdrawRPL(uint256 _amount) override external onlyLatestContract("rocketNodeStaking", address(this)) onlyRegisteredNode(msg.sender) {
        // Load contracts
        RocketDAOProtocolSettingsRewardsInterface rocketDAOProtocolSettingsRewards = RocketDAOProtocolSettingsRewardsInterface(getContractAddress("rocketDAOProtocolSettingsRewards"));
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        // Check cooldown period (one claim period) has passed since RPL last staked
        require(block.number.sub(getNodeRPLStakedBlock(msg.sender)) >= rocketDAOProtocolSettingsRewards.getRewardsClaimIntervalBlocks(), "The withdrawal cooldown period has not passed");
        // Get & check node's current RPL stake
        uint256 rplStake = getNodeRPLStake(msg.sender);
        require(rplStake >= _amount, "Withdrawal amount exceeds node's staked RPL balance");
        // Calculate node's minimum RPL stake
        uint256 minRplStake = rocketMinipoolSettings.getHalfDepositUserAmount()
            .mul(rocketDAOProtocolSettingsNode.getMinimumPerMinipoolStake())
            .mul(rocketMinipoolManager.getNodeMinipoolCount(msg.sender))
            .div(rocketNetworkPrices.getRPLPrice());
        // Check withdrawal would not undercollateralize node
        require(rplStake.sub(_amount) >= minRplStake, "Node's staked RPL balance after withdrawal is less than minimum balance");
        // Transfer RPL tokens to node address
        rocketVault.withdrawToken(msg.sender, getContractAddress("rocketTokenRPL"), _amount);
        // Update RPL stake amounts
        decreaseTotalRPLStake(_amount);
        decreaseNodeRPLStake(msg.sender, _amount);
        // Emit RPL withdrawn event
        emit RPLWithdrawn(msg.sender, _amount, block.timestamp);
    }

    // Slash a node's RPL by an ETH amount
    // Only accepts calls from the RocketMinipoolStatus contract
    function slashRPL(address _nodeAddress, uint256 _ethSlashAmount) override external onlyLatestContract("rocketNodeStaking", address(this)) onlyLatestContract("rocketMinipoolStatus", msg.sender) {
        // Load contracts
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        // Calculate RPL amount to slash
        uint256 calcBase = 1 ether;
        uint256 rplSlashAmount = calcBase.mul(_ethSlashAmount).div(rocketNetworkPrices.getRPLPrice());
        // Cap slashed amount to node's RPL stake
        uint256 rplStake = getNodeRPLStake(_nodeAddress);
        if (rplSlashAmount > rplStake) { rplSlashAmount = rplStake; }
        // Transfer slashed amount to auction contract
        rocketVault.transferToken("rocketAuctionManager", getContractAddress("rocketTokenRPL"), rplSlashAmount);
        // Update RPL stake amounts
        decreaseTotalRPLStake(rplSlashAmount);
        decreaseNodeRPLStake(_nodeAddress, rplSlashAmount);
        // Emit RPL slashed event
        emit RPLSlashed(_nodeAddress, rplSlashAmount, _ethSlashAmount, block.timestamp);
    }

}
