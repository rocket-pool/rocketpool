pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/network/RocketNetworkPricesInterface.sol";
import "../../interface/node/RocketNodeStakingInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../interface/settings/RocketNodeSettingsInterface.sol";
import "../../interface/RocketVaultInterface.sol";

// Handles node deposits and minipool creation

contract RocketNodeStaking is RocketBase, RocketNodeStakingInterface {

    // Libs
    using SafeMath for uint;

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Get/set the total RPL stake amount
    function getTotalRPLStake() override public view returns (uint256) {
        return getUintS("rpl.staked.total");
    }
    function setTotalRPLStake(uint256 _amount) private {
        setUintS("rpl.staked.total", _amount);
    }

    // Get/set a node's RPL stake amount
    function getNodeRPLStake(address _nodeAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("rpl.staked.node", _nodeAddress)));
    }
    function setNodeRPLStake(address _nodeAddress, uint256 _amount) private {
        setUint(keccak256(abi.encodePacked("rpl.staked.node", _nodeAddress)), _amount);
    }

    // Get a node's effective RPL stake amount
    function getNodeEffectiveRPLStake(address _nodeAddress) override public view returns (uint256) {
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        RocketNodeSettingsInterface rocketNodeSettings = RocketNodeSettingsInterface(getContractAddress("rocketNodeSettings"));
        // Calculate node's maximum RPL stake
        uint256 maxRplStake = rocketMinipoolSettings.getHalfDepositUserAmount()
            .mul(rocketNodeSettings.getMaximumPerMinipoolStake())
            .mul(rocketMinipoolManager.getNodeMinipoolCount(_nodeAddress))
            .div(rocketNetworkPrices.getRPLPrice());
        // Calculate & return effective stake amount
        uint256 rplStake = getNodeRPLStake(_nodeAddress);
        if (rplStake < maxRplStake) { return rplStake; }
        else { return maxRplStake; }
    }

    // Get a node's minipool limit based on RPL stake
    function getNodeMinipoolLimit(address _nodeAddress) override public view returns (uint256) {
        // Load contracts
        RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        RocketNodeSettingsInterface rocketNodeSettings = RocketNodeSettingsInterface(getContractAddress("rocketNodeSettings"));
        // Calculate & return minipool limit
        return getNodeRPLStake(_nodeAddress)
            .mul(rocketNetworkPrices.getRPLPrice())
            .div(
                rocketMinipoolSettings.getHalfDepositUserAmount()
                .mul(rocketNodeSettings.getMinimumPerMinipoolStake())
            );
    }

    // Accept an RPL stake
    // Only accepts calls from registered nodes
    function stakeRPL(uint256 _amount) override external payable onlyLatestContract("rocketNodeStaking", address(this)) onlyRegisteredNode(msg.sender) {
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
        // Update RPL stake amounts
        increaseTotalRPLStake(_amount);
        increaseNodeRPLStake(msg.sender, _amount);
    }

    // Slash a node's RPL by an ETH amount
    // Only accepts calls from the RocketMinipoolStatus contract
    function slashRPL(address _nodeAddress, uint256 _ethSlashAmount) override external onlyLatestContract("rocketNodeStaking", address(this)) onlyLatestContract("rocketMinipoolStatus", msg.sender) {
        // Calculate RPL amount to slash
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        uint256 calcBase = 1 ether;
        uint256 rplSlashAmount = calcBase.mul(_ethSlashAmount).div(rocketNetworkPrices.getRPLPrice());
        // Cap slashed amount to node's RPL stake
        uint256 rplStake = getNodeRPLStake(_nodeAddress);
        if (rplSlashAmount > rplStake) { rplSlashAmount = rplStake; }
        // Transfer slashed amount to auction contract
        // TODO: implement
        // Update RPL stake amounts
        decreaseTotalRPLStake(rplSlashAmount);
        decreaseNodeRPLStake(_nodeAddress, rplSlashAmount);
    }

    // Increase/decrease the total RPL stake amount
    function increaseTotalRPLStake(uint256 _amount) private {
        setTotalRPLStake(getTotalRPLStake().add(_amount));
    }
    function decreaseTotalRPLStake(uint256 _amount) private {
        setTotalRPLStake(getTotalRPLStake().sub(_amount));
    } 

    // Increase/decrease a node's RPL stake amount
    function increaseNodeRPLStake(address _nodeAddress, uint256 _amount) private {
        setNodeRPLStake(_nodeAddress, getNodeRPLStake(_nodeAddress).add(_amount));
    }
    function decreaseNodeRPLStake(address _nodeAddress, uint256 _amount) private {
        setNodeRPLStake(_nodeAddress, getNodeRPLStake(_nodeAddress).sub(_amount));
    } 

}
