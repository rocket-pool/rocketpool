// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import "../../interface/RocketVaultInterface.sol";
import "../../interface/network/RocketNetworkSnapshotsInterface.sol";
import {RocketBase} from "../RocketBase.sol";
import {RocketNodeStakingInterface} from "../../interface/node/RocketNodeStakingInterface.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketTokenRPLInterface} from "../../interface/token/RocketTokenRPLInterface.sol";

/// @dev NOT USED IN PRODUCTION - Helper contract to manually adjust state for tests
contract StakeHelper is RocketBase {

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
    }

    function lockRPL(address _nodeAddress, uint256 _amount) external {
        RocketNodeStakingInterface rocketNodeStakingInterface = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
        rocketNodeStakingInterface.lockRPL(_nodeAddress, _amount);
    }

    function unlockRPL(address _nodeAddress, uint256 _amount) external {
        RocketNodeStakingInterface rocketNodeStakingInterface = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
        rocketNodeStakingInterface.unlockRPL(_nodeAddress, _amount);
    }

    function transferRPL(address _from, address _to, uint256 _amount) external {
        RocketNodeStakingInterface rocketNodeStakingInterface = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
        rocketNodeStakingInterface.transferRPL(_from, _to, _amount);
    }

    function burnRPL(address _from, uint256 _amount) external {
        RocketNodeStakingInterface rocketNodeStakingInterface = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
        rocketNodeStakingInterface.burnRPL(_from, _amount);
    }

    function addLegacyStakedRPL(address _nodeAddress, uint256 _amount) external {
        bytes32 migratedKey = keccak256(abi.encodePacked("rpl.legacy.staked.node.migrated", _nodeAddress));
        require(!getBool(migratedKey), "Cannot set once migrated");
        // Get contracts
        RocketTokenRPLInterface rplToken = RocketTokenRPLInterface(getContractAddress("rocketTokenRPL"));
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        // Transfer RPL tokens
        require(rplToken.transferFrom(msg.sender, address(this), _amount), "Could not transfer RPL to staking contract");
        // Deposit RPL tokens to vault
        require(rplToken.approve(address(rocketVault), _amount), "Could not approve vault RPL deposit");
        rocketVault.depositToken("rocketNodeStaking", rplToken, _amount);
        // Adjust value
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        bytes32 key = keccak256(abi.encodePacked("rpl.staked.node.amount", _nodeAddress));
        uint224 amount = rocketNetworkSnapshots.latestValue(key);
        rocketNetworkSnapshots.push(key, uint224(_amount) + amount);
        // Update total
        bytes32 totalKey = keccak256(abi.encodePacked("rpl.staked.total.amount"));
        addUint(totalKey, _amount);
    }
}
