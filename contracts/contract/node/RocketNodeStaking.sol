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
        version = 3;
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

    // Get a node's matched ETH amount (amount taken from protocol to stake)
    function getNodeETHMatched(address _nodeAddress) override public view returns (uint256) {
        uint256 ethMatched = getUint(keccak256(abi.encodePacked("eth.matched.node.amount", _nodeAddress)));

        if (ethMatched > 0) {
            return ethMatched;
        } else {
            // Fallback for backwards compatibility before ETH matched was recorded (all minipools matched 16 ETH from protocol)
            RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
            return rocketMinipoolManager.getNodeStakingMinipoolCount(_nodeAddress).mul(16 ether);
        }
    }

    // Get a node's provided ETH amount (amount supplied to create minipools)
    function getNodeETHProvided(address _nodeAddress) override public view returns (uint256) {
        // Get contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        uint256 stakingMinipoolCount = rocketMinipoolManager.getNodeStakingMinipoolCount(_nodeAddress);
        // Retrieve stored ETH matched value
        uint256 ethMatched = getUint(keccak256(abi.encodePacked("eth.matched.node.amount", _nodeAddress)));
        if (ethMatched > 0) {
            // ETH provided is number of staking minipools * 32 - eth matched
            // TODO: This 32 ETH probably shouldn't be a constant (do we need to also store user ETH in case 32 ETH deposit amount ever changes?)
            uint256 totalEthStaked = stakingMinipoolCount.mul(32 ether);
            return totalEthStaked.sub(ethMatched);
        } else {
            // Fallback for legacy minipools is number of staking minipools * 16
            return stakingMinipoolCount.mul(16 ether);
        }
    }

    // Returns the ratio between total initial ETH of a validator and ETH provided by a node operator
    function getNodeETHCollateralisationRatio(address _nodeAddress) override public view returns (uint256) {
        uint256 ethMatched = getUint(keccak256(abi.encodePacked("eth.matched.node.amount", _nodeAddress)));
        if (ethMatched == 0) {
            // All legacy minipools had a 1:1 ratio
            return 2;
        } else {
            RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
            // TODO: This 32 ETH probably shouldn't be a literal (do we need to also store user ETH in case 32 ETH deposit amount ever changes?)
            uint256 totalEthStaked = rocketMinipoolManager.getNodeStakingMinipoolCount(_nodeAddress).mul(32 ether);
            return totalEthStaked.div(totalEthStaked.sub(ethMatched));
        }
    }

    // Get/set the time a node last staked RPL at
    function getNodeRPLStakedTime(address _nodeAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("rpl.staked.node.time", _nodeAddress)));
    }
    function setNodeRPLStakedTime(address _nodeAddress, uint256 _time) private {
        setUint(keccak256(abi.encodePacked("rpl.staked.node.time", _nodeAddress)), _time);
    }

    // Get a node's effective RPL stake amount
    function getNodeEffectiveRPLStake(address _nodeAddress) override external view returns (uint256) {
        // Load contracts
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Get node's current RPL stake
        uint256 rplStake = getNodeRPLStake(_nodeAddress);
        // Retrieve variables for calculations
        uint256 matchedETH = getNodeETHMatched(_nodeAddress);
        uint256 rplPrice = rocketNetworkPrices.getRPLPrice();
        // RPL stake cannot exceed maximum
        uint256 maximumStakePercent = rocketDAOProtocolSettingsNode.getMaximumPerMinipoolStake();
        uint256 maximumStake = matchedETH.mul(maximumStakePercent).div(rplPrice);
        if (rplStake > maximumStake) {
            return maximumStake;
        }
        // If RPL stake is lower than minimum, node has no effective stake
        uint256 minimumStakePercent = rocketDAOProtocolSettingsNode.getMinimumPerMinipoolStake();
        uint256 minimumStake = matchedETH.mul(minimumStakePercent).div(rplPrice);
        if (rplStake < minimumStake) {
            return 0;
        }
        // Otherwise, return the actual stake
        return rplStake;
    }

    // Get a node's minimum RPL stake to collateralize their minipools
    function getNodeMinimumRPLStake(address _nodeAddress) override external view returns (uint256) {
        // Load contracts
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Retrieve variables
        uint256 minimumStakePercent = rocketDAOProtocolSettingsNode.getMinimumPerMinipoolStake();
        uint256 matchedETH = getNodeETHMatched(_nodeAddress);
        return matchedETH
            .mul(minimumStakePercent)
            .div(rocketNetworkPrices.getRPLPrice());
    }

    // Get a node's maximum RPL stake to fully collateralize their minipools
    function getNodeMaximumRPLStake(address _nodeAddress) override public view returns (uint256) {
        // Load contracts
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Retrieve variables
        uint256 maximumStakePercent = rocketDAOProtocolSettingsNode.getMaximumPerMinipoolStake();
        uint256 matchedETH = getNodeETHMatched(_nodeAddress);
        return matchedETH
            .mul(maximumStakePercent)
            .div(rocketNetworkPrices.getRPLPrice());
    }

    // Get a node's limit of how much user ETH they can use based on RPL stake
    function getNodeETHMatchedLimit(address _nodeAddress) override external view returns (uint256) {
        // Load contracts
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Calculate & return limit
        uint256 minimumStakePercent = rocketDAOProtocolSettingsNode.getMinimumPerMinipoolStake();
        return getNodeRPLStake(_nodeAddress)
            .mul(rocketNetworkPrices.getRPLPrice())
            .div(minimumStakePercent);
    }

    // Accept an RPL stake
    // Only accepts calls from registered nodes
    function stakeRPL(uint256 _amount) override external onlyLatestContract("rocketNodeStaking", address(this)) onlyRegisteredNode(msg.sender) {
        _stakeRPL(msg.sender, _amount);
    }

    // Accept an RPL stake from any address for a specified node
    function stakeRPLFor(address _nodeAddress, uint256 _amount) override external onlyLatestContract("rocketNodeStaking", address(this)) onlyRegisteredNode(_nodeAddress) {
        _stakeRPL(_nodeAddress, _amount);
    }

    function _stakeRPL(address _nodeAddress, uint256 _amount) internal {
        // Load contracts
        address rplTokenAddress = getContractAddress("rocketTokenRPL");
        address rocketVaultAddress = getContractAddress("rocketVault");
        IERC20 rplToken = IERC20(rplTokenAddress);
        RocketVaultInterface rocketVault = RocketVaultInterface(rocketVaultAddress);
        // Transfer RPL tokens
        require(rplToken.transferFrom(msg.sender, address(this), _amount), "Could not transfer RPL to staking contract");
        // Deposit RPL tokens to vault
        require(rplToken.approve(rocketVaultAddress, _amount), "Could not approve vault RPL deposit");
        rocketVault.depositToken("rocketNodeStaking", rplToken, _amount);
        // Get node's current stake
        uint256 rplStake = getNodeRPLStake(_nodeAddress);
        // Update RPL stake amounts & node RPL staked block
        increaseTotalRPLStake(_amount);
        increaseNodeRPLStake(_nodeAddress, _amount);
        setNodeRPLStakedTime(_nodeAddress, block.timestamp);
        // Emit RPL staked event
        emit RPLStaked(_nodeAddress, _amount, block.timestamp);
    }

    // Withdraw staked RPL back to the node account
    // Only accepts calls from registered nodes
    function withdrawRPL(uint256 _amount) override external onlyLatestContract("rocketNodeStaking", address(this)) onlyRegisteredNode(msg.sender) {
        // Load contracts
        RocketDAOProtocolSettingsRewardsInterface rocketDAOProtocolSettingsRewards = RocketDAOProtocolSettingsRewardsInterface(getContractAddress("rocketDAOProtocolSettingsRewards"));
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        // Check cooldown period (one claim period) has passed since RPL last staked
        require(block.timestamp.sub(getNodeRPLStakedTime(msg.sender)) >= rocketDAOProtocolSettingsRewards.getRewardsClaimIntervalTime(), "The withdrawal cooldown period has not passed");
        // Get & check node's current RPL stake
        uint256 rplStake = getNodeRPLStake(msg.sender);
        require(rplStake >= _amount, "Withdrawal amount exceeds node's staked RPL balance");
        // Check withdrawal would not undercollateralize node
        require(rplStake.sub(_amount) >= getNodeMaximumRPLStake(msg.sender), "Node's staked RPL balance after withdrawal is less than required balance");
        // Update RPL stake amounts
        decreaseTotalRPLStake(_amount);
        decreaseNodeRPLStake(msg.sender, _amount);
        // Transfer RPL tokens to node address
        rocketVault.withdrawToken(rocketStorage.getNodeWithdrawalAddress(msg.sender), IERC20(getContractAddress("rocketTokenRPL")), _amount);
        // Emit RPL withdrawn event
        emit RPLWithdrawn(msg.sender, _amount, block.timestamp);
    }

    // Slash a node's RPL by an ETH amount
    // Only accepts calls from registered minipools
    function slashRPL(address _nodeAddress, uint256 _ethSlashAmount) override external onlyLatestContract("rocketNodeStaking", address(this)) onlyRegisteredMinipool(msg.sender) {
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
