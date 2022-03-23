pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/network/RocketNetworkPricesInterface.sol";
import "../../interface/node/RocketNodeStakingInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsRewardsInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol";
import "../../interface/RocketVaultInterface.sol";
import "../../interface/util/AddressSetStorageInterface.sol";

// Handles node deposits and minipool creation

contract RocketNodeStaking is RocketBase, RocketNodeStakingInterface {

    // Libs
    using SafeMath for uint;

    // Events
    event GGPStaked(address indexed from, uint256 amount, uint256 time);
    event GGPWithdrawn(address indexed to, uint256 amount, uint256 time);
    event GGPSlashed(address indexed node, uint256 amount, uint256 ethValue, uint256 time);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    // Get/set the total GGP stake amount
    function getTotalGGPStake() override external view returns (uint256) {
        return getUint(keccak256("ggp.staked.total.amount"));
    }
    function increaseTotalGGPStake(uint256 _amount) private {
        addUint(keccak256("ggp.staked.total.amount"), _amount);
    }
    function decreaseTotalGGPStake(uint256 _amount) private {
        subUint(keccak256("ggp.staked.total.amount"), _amount);
    }

    // Get/set a node's GGP stake amount
    function getNodeGGPStake(address _nodeAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("ggp.staked.node.amount", _nodeAddress)));
    }
    function increaseNodeGGPStake(address _nodeAddress, uint256 _amount) private {
        addUint(keccak256(abi.encodePacked("ggp.staked.node.amount", _nodeAddress)), _amount);
    }
    function decreaseNodeGGPStake(address _nodeAddress, uint256 _amount) private {
        subUint(keccak256(abi.encodePacked("ggp.staked.node.amount", _nodeAddress)), _amount);
    }

    // Get/set the time a node last staked GGP at
    function getNodeGGPStakedTime(address _nodeAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("ggp.staked.node.time", _nodeAddress)));
    }
    function setNodeGGPStakedTime(address _nodeAddress, uint256 _time) private {
        setUint(keccak256(abi.encodePacked("ggp.staked.node.time", _nodeAddress)), _time);
    }

    // Get the total effective GGP stake amount
    function getTotalEffectiveGGPStake() override external view returns (uint256) {
        // Load contracts
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        return rocketNetworkPrices.getEffectiveGGPStake();
    }

    // Calculate total effective GGP stake, this features a potentially unbounded loop so can not be called on-chain
    // Instead, it is intended to be called by oracle nodes to be submitted alongside price updates
    function calculateTotalEffectiveGGPStake(uint256 offset, uint256 limit, uint256 ggpPrice) override external view returns (uint256) {
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Calculate current max GGP stake per minipool
        uint256 maxGgpStakePerMinipool = rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount()
            .mul(rocketDAOProtocolSettingsNode.getMaximumPerMinipoolStake());
        // Loop all nodes and calculate their effective rate to sum
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        bytes32 key = keccak256("nodes.index");
        uint256 totalNodes = addressSetStorage.getCount(key);
        uint256 max = offset.add(limit);
        if (max > totalNodes || limit == 0) { max = totalNodes; }
        uint256 total = 0;
        for (uint i = offset; i < max; i++){
            // Get the node's address from the set
            address nodeAddress = addressSetStorage.getItem(key, i);
            // Get node's current GGP stake
            uint256 ggpStake = getNodeGGPStake(nodeAddress);
            uint256 maxGgpStake = maxGgpStakePerMinipool.mul(rocketMinipoolManager.getNodeStakingMinipoolCount(nodeAddress)).div(ggpPrice);
            // Calculate node's maximum GGP stake
            if (ggpStake < maxGgpStake) { total = total.add(ggpStake); }
            else { total = total.add(maxGgpStake); }
        }
        return total;
    }

    // Get a node's effective GGP stake amount
    function getNodeEffectiveGGPStake(address _nodeAddress) override external view returns (uint256) {
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Get node's current GGP stake
        uint256 ggpStake = getNodeGGPStake(_nodeAddress);
        // Calculate node's maximum GGP stake
        uint256 maxGgpStake = rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount()
            .mul(rocketDAOProtocolSettingsNode.getMaximumPerMinipoolStake())
            .mul(rocketMinipoolManager.getNodeStakingMinipoolCount(_nodeAddress))
            .div(rocketNetworkPrices.getGGPPrice());
        // Return effective stake amount
        if (ggpStake < maxGgpStake) { return ggpStake; }
        else { return maxGgpStake; }
    }

    // Get a node's minimum GGP stake to collateralize their minipools
    function getNodeMinimumGGPStake(address _nodeAddress) override external view returns (uint256) {
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Calculate minimum GGP stake
        return rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount()
            .mul(rocketDAOProtocolSettingsNode.getMinimumPerMinipoolStake())
            .mul(rocketMinipoolManager.getNodeActiveMinipoolCount(_nodeAddress))
            .div(rocketNetworkPrices.getGGPPrice());
    }

    // Get a node's maximum GGP stake to fully collateralize their minipools
    function getNodeMaximumGGPStake(address _nodeAddress) override public view returns (uint256) {
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Calculate maximum GGP stake
        return rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount()
            .mul(rocketDAOProtocolSettingsNode.getMaximumPerMinipoolStake())
            .mul(rocketMinipoolManager.getNodeActiveMinipoolCount(_nodeAddress))
            .div(rocketNetworkPrices.getGGPPrice());
    }

    // Get a node's minipool limit based on GGP stake
    function getNodeMinipoolLimit(address _nodeAddress) override external view returns (uint256) {
        // Load contracts
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Calculate & return minipool limit
        return getNodeGGPStake(_nodeAddress)
            .mul(rocketNetworkPrices.getGGPPrice())
            .div(
                rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount()
                .mul(rocketDAOProtocolSettingsNode.getMinimumPerMinipoolStake())
            );
    }

    // Accept an GGP stake
    // Only accepts calls from registered nodes
    function stakeGGP(uint256 _amount) override external onlyLatestContract("rocketNodeStaking", address(this)) onlyRegisteredNode(msg.sender) {
        // Load contracts
        address ggpTokenAddress = getContractAddress("gogoTokenGGP");
        address rocketVaultAddress = getContractAddress("rocketVault");
        IERC20 ggpToken = IERC20(ggpTokenAddress);
        RocketVaultInterface rocketVault = RocketVaultInterface(rocketVaultAddress);
        // Transfer GGP tokens
        require(ggpToken.transferFrom(msg.sender, address(this), _amount), "Could not transfer GGP to staking contract");
        // Deposit GGP tokens to vault
        require(ggpToken.approve(rocketVaultAddress, _amount), "Could not approve vault GGP deposit");
        rocketVault.depositToken("rocketNodeStaking", ggpToken, _amount);
        // Get node's current stake
        uint256 ggpStake = getNodeGGPStake(msg.sender);
        // Update GGP stake amounts & node GGP staked block
        increaseTotalGGPStake(_amount);
        increaseNodeGGPStake(msg.sender, _amount);
        updateTotalEffectiveGGPStake(msg.sender, ggpStake, ggpStake.add(_amount));
        setNodeGGPStakedTime(msg.sender, block.timestamp);
        // Emit GGP staked event
        emit GGPStaked(msg.sender, _amount, block.timestamp);
    }

    // Withdraw staked GGP back to the node account
    // Only accepts calls from registered nodes
    function withdrawGGP(uint256 _amount) override external onlyLatestContract("rocketNodeStaking", address(this)) onlyRegisteredNode(msg.sender) {
        // Load contracts
        RocketDAOProtocolSettingsRewardsInterface rocketDAOProtocolSettingsRewards = RocketDAOProtocolSettingsRewardsInterface(getContractAddress("rocketDAOProtocolSettingsRewards"));
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        // Check cooldown period (one claim period) has passed since GGP last staked
        require(block.timestamp.sub(getNodeGGPStakedTime(msg.sender)) >= rocketDAOProtocolSettingsRewards.getRewardsClaimIntervalTime(), "The withdrawal cooldown period has not passed");
        // Get & check node's current GGP stake
        uint256 ggpStake = getNodeGGPStake(msg.sender);
        require(ggpStake >= _amount, "Withdrawal amount exceeds node's staked GGP balance");
        // Check withdrawal would not undercollateralize node
        require(ggpStake.sub(_amount) >= getNodeMaximumGGPStake(msg.sender), "Node's staked GGP balance after withdrawal is less than required balance");
        // Update GGP stake amounts
        decreaseTotalGGPStake(_amount);
        decreaseNodeGGPStake(msg.sender, _amount);
        updateTotalEffectiveGGPStake(msg.sender, ggpStake, ggpStake.sub(_amount));
        // Transfer GGP tokens to node address
        rocketVault.withdrawToken(rocketStorage.getNodeWithdrawalAddress(msg.sender), IERC20(getContractAddress("gogoTokenGGP")), _amount);
        // Emit GGP withdrawn event
        emit GGPWithdrawn(msg.sender, _amount, block.timestamp);
    }

    // Updates the stored total effective rate based on a node's changing staking balance
    function updateTotalEffectiveGGPStake(address _nodeAddress, uint256 _oldStake, uint256 _newStake) private {
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Require price consensus
        require(rocketNetworkPrices.inConsensus(), "Network is not in consensus");
        // Get the node's maximum possible stake
        uint256 maxGgpStake = rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount()
            .mul(rocketDAOProtocolSettingsNode.getMaximumPerMinipoolStake())
            .mul(rocketMinipoolManager.getNodeStakingMinipoolCount(_nodeAddress))
            .div(rocketNetworkPrices.getGGPPrice());
        // Easy out if total stake isn't changing
        if (_oldStake >= maxGgpStake && _newStake >= maxGgpStake) {
            return;
        }
        // Check if we have to decrease total
        if (_oldStake > _newStake) {
            uint256 decrease = _oldStake.sub(_newStake);
            uint256 delta = maxGgpStake.sub(_newStake);
            if (decrease < delta) { delta = decrease; }
            rocketNetworkPrices.decreaseEffectiveGGPStake(delta);
            return;
        }
        // Check if we have to increase total
        if (_newStake > _oldStake) {
            uint256 increase = _newStake.sub(_oldStake);
            uint256 delta = maxGgpStake.sub(_oldStake);
            if (delta > increase) { delta = increase; }
            rocketNetworkPrices.increaseEffectiveGGPStake(delta);
        }
        // _oldStake == _newStake (do nothing but shouldn't happen)
    }

    // Slash a node's GGP by an ETH amount
    // Only accepts calls from registered minipools
    function slashGGP(address _nodeAddress, uint256 _ethSlashAmount) override external onlyLatestContract("rocketNodeStaking", address(this)) onlyRegisteredMinipool(msg.sender) {
        // Load contracts
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        // Calculate GGP amount to slash
        uint256 ggpSlashAmount = calcBase.mul(_ethSlashAmount).div(rocketNetworkPrices.getGGPPrice());
        // Cap slashed amount to node's GGP stake
        uint256 ggpStake = getNodeGGPStake(_nodeAddress);
        if (ggpSlashAmount > ggpStake) { ggpSlashAmount = ggpStake; }
        // Transfer slashed amount to auction contract
        if(ggpSlashAmount > 0) rocketVault.transferToken("rocketAuctionManager", IERC20(getContractAddress("gogoTokenGGP")), ggpSlashAmount);
        // Update GGP stake amounts
        decreaseTotalGGPStake(ggpSlashAmount);
        decreaseNodeGGPStake(_nodeAddress, ggpSlashAmount);
        updateTotalEffectiveGGPStake(_nodeAddress, ggpStake, ggpStake.sub(ggpSlashAmount));
        // Emit GGP slashed event
        emit GGPSlashed(_nodeAddress, ggpSlashAmount, _ethSlashAmount, block.timestamp);
    }

}
