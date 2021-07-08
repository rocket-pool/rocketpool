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
    event RPLStaked(address indexed from, uint256 amount, uint256 time);
    event RPLWithdrawn(address indexed to, uint256 amount, uint256 time);
    event RPLSlashed(address indexed node, uint256 amount, uint256 ethValue, uint256 time);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    // Get/set the total RPL stake amount
    function getTotalRPLStake() override external view returns (uint256) {
        return getUint(keccak256("rpl.staked.total.amount"));
    }
    function increaseTotalRPLStake(uint256 _amount) private {
        addUint(keccak256("rpl.staked.total.amount"), _amount);
    }
    function decreaseTotalRPLStake(uint256 _amount) private {
        subUint(keccak256("rpl.staked.total.amount"), _amount);
    }

    // Get/set a node's RPL stake amount
    function getNodeRPLStake(address _nodeAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("rpl.staked.node.amount", _nodeAddress)));
    }
    function increaseNodeRPLStake(address _nodeAddress, uint256 _amount) private {
        addUint(keccak256(abi.encodePacked("rpl.staked.node.amount", _nodeAddress)), _amount);
    }
    function decreaseNodeRPLStake(address _nodeAddress, uint256 _amount) private {
        subUint(keccak256(abi.encodePacked("rpl.staked.node.amount", _nodeAddress)), _amount);
    }

    // Get/set the time a node last staked RPL at
    function getNodeRPLStakedTime(address _nodeAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("rpl.staked.node.time", _nodeAddress)));
    }
    function setNodeRPLStakedTime(address _nodeAddress, uint256 _time) private {
        setUint(keccak256(abi.encodePacked("rpl.staked.node.time", _nodeAddress)), _time);
    }

    // Get the total effective RPL stake amount
    function getTotalEffectiveRPLStake() override external view returns (uint256) {
        // Load contracts
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        return rocketNetworkPrices.getEffectiveRPLStake();
    }

    // Calculate total effective RPL stake, this features a potentially unbounded loop so can not be called on-chain
    // Instead, it is intended to be called by oracle nodes to be submitted alongside price updates
    function calculateTotalEffectiveRPLStake(uint256 offset, uint256 limit, uint256 rplPrice) override external view returns (uint256) {
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Calculate current max RPL stake per minipool
        uint256 maxRplStakePerMinipool = rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount()
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
            // Get node's current RPL stake
            uint256 rplStake = getNodeRPLStake(nodeAddress);
            uint256 maxRplStake = maxRplStakePerMinipool.mul(rocketMinipoolManager.getNodeStakingMinipoolCount(nodeAddress)).div(rplPrice);
            // Calculate node's maximum RPL stake
            if (rplStake < maxRplStake) { total = total.add(rplStake); }
            else { total = total.add(maxRplStake); }
        }
        return total;
    }

    // Get a node's effective RPL stake amount
    function getNodeEffectiveRPLStake(address _nodeAddress) override external view returns (uint256) {
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Get node's current RPL stake
        uint256 rplStake = getNodeRPLStake(_nodeAddress);
        // Calculate node's maximum RPL stake
        uint256 maxRplStake = rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount()
            .mul(rocketDAOProtocolSettingsNode.getMaximumPerMinipoolStake())
            .mul(rocketMinipoolManager.getNodeStakingMinipoolCount(_nodeAddress))
            .div(rocketNetworkPrices.getRPLPrice());
        // Return effective stake amount
        if (rplStake < maxRplStake) { return rplStake; }
        else { return maxRplStake; }
    }

    // Get a node's minimum RPL stake to collateralize their minipools
    function getNodeMinimumRPLStake(address _nodeAddress) override external view returns (uint256) {
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Calculate minimum RPL stake
        return rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount()
            .mul(rocketDAOProtocolSettingsNode.getMinimumPerMinipoolStake())
            .mul(rocketMinipoolManager.getNodeMinipoolCount(_nodeAddress))
            .div(rocketNetworkPrices.getRPLPrice());
    }

    // Get a node's maximum RPL stake to fully collateralize their minipools
    function getNodeMaximumRPLStake(address _nodeAddress) override public view returns (uint256) {
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Calculate maximum RPL stake
        return rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount()
            .mul(rocketDAOProtocolSettingsNode.getMaximumPerMinipoolStake())
            .mul(rocketMinipoolManager.getNodeMinipoolCount(_nodeAddress))
            .div(rocketNetworkPrices.getRPLPrice());
    }

    // Get a node's minipool limit based on RPL stake
    function getNodeMinipoolLimit(address _nodeAddress) override external view returns (uint256) {
        // Load contracts
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Calculate & return minipool limit
        return getNodeRPLStake(_nodeAddress)
            .mul(rocketNetworkPrices.getRPLPrice())
            .div(
                rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount()
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
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        // Prevent staking between price update block and price consensus
        require(rocketNetworkPrices.inConsensus(), "Cannot stake while network is reaching consensus");
        // Transfer RPL tokens
        require(rplToken.transferFrom(msg.sender, address(this), _amount), "Could not transfer RPL to staking contract");
        // Deposit RPL tokens to vault
        require(rplToken.approve(rocketVaultAddress, _amount), "Could not approve vault RPL deposit");
        rocketVault.depositToken("rocketNodeStaking", rplToken, _amount);
        // Get node's current stake
        uint256 rplStake = getNodeRPLStake(msg.sender);
        // Update RPL stake amounts & node RPL staked block
        increaseTotalRPLStake(_amount);
        increaseNodeRPLStake(msg.sender, _amount);
        updateTotalEffectiveRPLStake(rplStake, rplStake.add(_amount));
        setNodeRPLStakedTime(msg.sender, block.timestamp);
        // Emit RPL staked event
        emit RPLStaked(msg.sender, _amount, block.timestamp);
    }

    // Withdraw staked RPL back to the node account
    // Only accepts calls from registered nodes
    function withdrawRPL(uint256 _amount) override external onlyLatestContract("rocketNodeStaking", address(this)) onlyRegisteredNode(msg.sender) {
        // Load contracts
        RocketDAOProtocolSettingsRewardsInterface rocketDAOProtocolSettingsRewards = RocketDAOProtocolSettingsRewardsInterface(getContractAddress("rocketDAOProtocolSettingsRewards"));
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        // Check cooldown period (one claim period) has passed since RPL last staked
        require(block.timestamp.sub(getNodeRPLStakedTime(msg.sender)) >= rocketDAOProtocolSettingsRewards.getRewardsClaimIntervalTime(), "The withdrawal cooldown period has not passed");
        // Prevent unstaking between price update block and price consensus
        require(rocketNetworkPrices.inConsensus(), "Cannot withdraw while network is reaching consensus");
        // Get & check node's current RPL stake
        uint256 rplStake = getNodeRPLStake(msg.sender);
        require(rplStake >= _amount, "Withdrawal amount exceeds node's staked RPL balance");
        // Check withdrawal would not undercollateralize node
        require(rplStake.sub(_amount) >= getNodeMaximumRPLStake(msg.sender), "Node's staked RPL balance after withdrawal is less than required balance");
        // Update RPL stake amounts
        decreaseTotalRPLStake(_amount);
        decreaseNodeRPLStake(msg.sender, _amount);
        updateTotalEffectiveRPLStake(rplStake, rplStake.sub(_amount));
        // Transfer RPL tokens to node address
        rocketVault.withdrawToken(msg.sender, IERC20(getContractAddress("rocketTokenRPL")), _amount);
        // Emit RPL withdrawn event
        emit RPLWithdrawn(msg.sender, _amount, block.timestamp);
    }

    // Updates the stored total effective rate based on a node's changing staking balance
    function updateTotalEffectiveRPLStake(uint256 _oldStake, uint256 _newStake) private {
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Get the node's maximum possible stake
        uint256 maxRplStake = rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount()
            .mul(rocketDAOProtocolSettingsNode.getMaximumPerMinipoolStake())
            .mul(rocketMinipoolManager.getNodeStakingMinipoolCount(msg.sender))
            .div(rocketNetworkPrices.getRPLPrice());
        // Easy out if total stake isn't changing
        if (_oldStake >= maxRplStake && _newStake >= maxRplStake) {
            return;
        }
        // Check if we have to decrease total
        if (_oldStake > _newStake) {
            uint256 decrease = _oldStake.sub(_newStake);
            uint256 delta = maxRplStake.sub(_newStake);
            if (decrease < delta) { delta = decrease; }
            rocketNetworkPrices.decreaseEffectiveRPLStake(delta);
            return;
        }
        // Check if we have to increase total
        if (_newStake > _oldStake) {
            uint256 increase = _newStake.sub(_oldStake);
            uint256 delta = maxRplStake.sub(_oldStake);
            if (delta > increase) { delta = increase; }
            rocketNetworkPrices.increaseEffectiveRPLStake(delta);
        }
        // _oldStake == _newStake (do nothing but shouldn't happen)
    }

    // Slash a node's RPL by an ETH amount
    // Only accepts calls from the RocketMinipoolStatus contract
    function slashRPL(address _nodeAddress, uint256 _ethSlashAmount) override external onlyLatestContract("rocketNodeStaking", address(this)) onlyLatestContract("rocketMinipoolStatus", msg.sender) {
        // Load contracts
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        // Calculate RPL amount to slash
        uint256 rplSlashAmount = calcBase.mul(_ethSlashAmount).div(rocketNetworkPrices.getRPLPrice());
        // Cap slashed amount to node's RPL stake
        uint256 rplStake = getNodeRPLStake(_nodeAddress);
        if (rplSlashAmount > rplStake) { rplSlashAmount = rplStake; }
        // Transfer slashed amount to auction contract
        if(rplSlashAmount > 0) rocketVault.transferToken("rocketAuctionManager", IERC20(getContractAddress("rocketTokenRPL")), rplSlashAmount);
        // Update RPL stake amounts
        decreaseTotalRPLStake(rplSlashAmount);
        decreaseNodeRPLStake(_nodeAddress, rplSlashAmount);
        // Emit RPL slashed event
        emit RPLSlashed(_nodeAddress, rplSlashAmount, _ethSlashAmount, block.timestamp);
    }

}
