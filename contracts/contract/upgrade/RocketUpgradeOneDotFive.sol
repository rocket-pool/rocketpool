// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketNetworkRevenuesInterface} from "../../interface/network/RocketNetworkRevenuesInterface.sol";
import {RocketMegapoolFactoryInterface} from "../../interface/megapool/RocketMegapoolFactoryInterface.sol";
import {RocketBase} from "../RocketBase.sol";
import {RocketMegapoolFactory} from "../megapool/RocketMegapoolFactory.sol";

interface InitialiseInterface {
    function initialise() external;
}

/// @notice v1.5 Saturn 2 upgrade contract
contract RocketUpgradeOneDotFive is RocketBase {
    // Whether the upgrade has been performed or not
    bool internal executed = false;

    // The deployer address
    address internal deployer;

    // Upgrade ABIs
    bool public locked = false;
    address[7] public addresses;
    string[7] public abis;

    // Construct
    constructor(
        RocketStorageInterface _rocketStorageAddress
    ) RocketBase(_rocketStorageAddress) {
        // Version
        version = 1;
        deployer = msg.sender;
    }

    // @notice Sets the addresses and ABIs of the upgrade
    function set(
        address[7] memory _addresses,
        string[7] memory _abis
    ) external {
        require(msg.sender == deployer, "Only deployer can set");
        require(!locked, "Already set");
        locked = true;
        addresses = _addresses;
        abis = _abis;
    }

    /// @notice Returns the address of the RocketStorage contract
    function getRocketStorageAddress() external view returns (address) {
        return address(rocketStorage);
    }

    /// @notice Once this contract has been voted in by oDAO, guardian can perform the upgrade
    function execute() external onlyGuardian {
        require(locked, "Addresses not set");
        require(!executed, "Already executed");
        executed = true;

        // Add/upgrade existing contracts
        _upgradeContract("rocketMegapoolDelegate", addresses[0],  abis[0]);
        _upgradeContract("rocketDAOProtocolSettingsMegapool", addresses[1],  abis[1]);
        _addContract("rocketNetworkRedemptions", addresses[2],  abis[2]);
        _upgradeContract("rocketDAOProtocolSettingsNetwork", addresses[3],  abis[3]);
        _upgradeContract("beaconStateVerifier", addresses[4],  abis[4]);
        _addContract("rocketNetworkParticipation", addresses[5],  abis[5]);
        _addContract("rocketNetworkExit", addresses[6],  abis[6]);

        // Execute delegate upgrade via factory
        address rocketMegapoolDelegateAddress = addresses[0];
        RocketMegapoolFactoryInterface rocketMegapoolFactory = RocketMegapoolFactoryInterface(getContractAddress("rocketMegapoolFactory"));
        rocketMegapoolFactory.upgradeDelegate(rocketMegapoolDelegateAddress);

        // Megapool settings
        {
            bytes32 settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "megapool"));
            // Set exit defict per RPIP-44
            setUint(keccak256(abi.encodePacked(settingNameSpace, "megapool.exit.deficit")), 0.2 ether);
        }

        // Network settings
        {
            bytes32 settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "network"));
            // Redemption settings per RPIP-71
            setUint(keccak256(abi.encodePacked(settingNameSpace, "deposit.pool.collateral.target")), 0.01 ether);
            setBool(keccak256(abi.encodePacked(settingNameSpace, "megapool.exit.phase")), false);
            setUint(keccak256(abi.encodePacked(settingNameSpace, "staking.delay")), 28 days);
            setUint(keccak256(abi.encodePacked(settingNameSpace, "tournament.size")), 4);
            // Existing setting changes per RPIP-71
            setUint(keccak256(abi.encodePacked(settingNameSpace, "network.reth.collateral.target")), 0.01 ether);
            // Exit settings per RPIP-80
            setUint(keccak256(abi.encodePacked(settingNameSpace, "network.cooperative.exit.phase")), 72 hours);
            setUint(keccak256(abi.encodePacked(settingNameSpace, "network.did.not.exit.penalty")), 0.1 ether);
            setUint(keccak256(abi.encodePacked(settingNameSpace, "network.did.not.exit.cooldown")), 28 days);
            // Performance exit settings per RPIP-73
            setBool(keccak256(abi.encodePacked(settingNameSpace, "network.performance.exits.enabled")), true);
            setUint(keccak256(abi.encodePacked(settingNameSpace, "network.performance.period")), 44032);
            setUint(keccak256(abi.encodePacked(settingNameSpace, "network.performance.proof.buffer")), 225);
            setUint(keccak256(abi.encodePacked(settingNameSpace, "network.performance.threshold")), 0.94 ether);
            setUint(keccak256(abi.encodePacked(settingNameSpace, "network.performance.challenge.period")), 24 hours);
        }

        // Security Council allowlist settings
        {
            setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "network", "network.performance.exits.enabled")), true);
        }

        // Set a protocol version value in storage for convenience with bindings
        setString(keccak256(abi.encodePacked("protocol.version")), "1.5");
    }

    /// @dev Upgrade a network contract
    function _upgradeContract(string memory _name, address _contractAddress, string memory _contractAbi) internal {
        // Get old contract address & check contract exists
        address oldContractAddress = getAddress(keccak256(abi.encodePacked("contract.address", _name)));
        require(oldContractAddress != address(0x0));
        // Check new contract address
        require(_contractAddress != address(0x0));
        require(_contractAddress != oldContractAddress);
        require(!getBool(keccak256(abi.encodePacked("contract.exists", _contractAddress))));
        // Check ABI isn't empty
        require(bytes(_contractAbi).length > 0);
        // Register new contract
        setBool(keccak256(abi.encodePacked("contract.exists", _contractAddress)), true);
        setString(keccak256(abi.encodePacked("contract.name", _contractAddress)), _name);
        setAddress(keccak256(abi.encodePacked("contract.address", _name)), _contractAddress);
        setString(keccak256(abi.encodePacked("contract.abi", _name)), _contractAbi);
        // Deregister old contract
        deleteString(keccak256(abi.encodePacked("contract.name", oldContractAddress)));
        deleteBool(keccak256(abi.encodePacked("contract.exists", oldContractAddress)));
    }

    /// @dev Add a new network contract
    function _addContract(string memory _name, address _contractAddress, string memory _contractAbi) internal {
        // Check contract name
        require(bytes(_name).length > 0);
        // Cannot add contract if it already exists (use upgradeContract instead)
        require(getAddress(keccak256(abi.encodePacked("contract.address", _name))) == address(0x0));
        // Cannot add contract if already in use as ABI only
        string memory existingAbi = getString(keccak256(abi.encodePacked("contract.abi", _name)));
        require(bytes(existingAbi).length == 0);
        // Check contract address
        require(_contractAddress != address(0x0));
        require(!getBool(keccak256(abi.encodePacked("contract.exists", _contractAddress))));
        // Check ABI isn't empty
        require(bytes(_contractAbi).length > 0);
        // Register contract
        setBool(keccak256(abi.encodePacked("contract.exists", _contractAddress)), true);
        setString(keccak256(abi.encodePacked("contract.name", _contractAddress)), _name);
        setAddress(keccak256(abi.encodePacked("contract.address", _name)), _contractAddress);
        setString(keccak256(abi.encodePacked("contract.abi", _name)), _contractAbi);
    }
}
