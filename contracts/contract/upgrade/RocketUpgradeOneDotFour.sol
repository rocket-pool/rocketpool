// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketNetworkRevenuesInterface} from "../../interface/network/RocketNetworkRevenuesInterface.sol";
import {RocketBase} from "../RocketBase.sol";

interface InitialiseInterface {
    function initialise() external;
}

/// @notice v1.4 Saturn 1 upgrade contract
contract RocketUpgradeOneDotFour is RocketBase {
    // Whether the upgrade has been performed or not
    bool internal executed;

    // Upgrade ABIs
    address[34] public addresses;
    string[34] public abis;

    // Construct
    constructor(
        RocketStorageInterface _rocketStorageAddress,
        address[34] memory _addresses,
        string[34] memory _abis
    ) RocketBase(_rocketStorageAddress) {
        // Version
        version = 1;
        addresses = _addresses;
        abis = _abis;
    }

    /// @notice Returns the address of the RocketStorage contract
    function getRocketStorageAddress() external view returns (address) {
        return address(rocketStorage);
    }

    /// @notice Once this contract has been voted in by oDAO, guardian can perform the upgrade
    function execute() external onlyGuardian {
        require(!executed);
        executed = true;

        // Add new contracts
        _addContract("rocketMegapoolDelegate", addresses[0], abis[0]);
        _addContract("rocketMegapoolFactory", addresses[1], abis[1]);
        _addContract("rocketMegapoolProxy", addresses[2], abis[2]);
        _addContract("rocketMegapoolManager", addresses[3], abis[3]);
        _addContract("linkedListStorage", addresses[8], abis[8]);
        _addContract("rocketNetworkRevenues", addresses[20], abis[20]);
        _addContract("blockRoots", addresses[25], abis[25]);
        _addContract("beaconStateVerifier", addresses[26], abis[26]);
        _addContract("rocketDAOProtocolSettingsMegapool", addresses[15], abis[15]);
        _addContract("rocketDAOSecurityUpgrade", addresses[17], abis[17]);
        _addContract("rocketMegapoolPenalties", addresses[33], abis[33]);

        // Upgrade existing contracts
        _upgradeContract("rocketNodeManager", addresses[4], abis[4]);
        _upgradeContract("rocketNodeDeposit", addresses[5], abis[5]);
        _upgradeContract("rocketNodeStaking", addresses[6], abis[6]);
        _upgradeContract("rocketNetworkBalances", addresses[21], abis[21]);
        _upgradeContract("rocketNetworkPenalties", addresses[23], abis[23]);
        _upgradeContract("rocketDepositPool", addresses[7], abis[7]);
        _upgradeContract("rocketNetworkSnapshots", addresses[22], abis[22]);
        _upgradeContract("rocketDAOProtocol", addresses[9], abis[9]);
        _upgradeContract("rocketDAOProtocolProposals", addresses[10], abis[10]);
        _upgradeContract("rocketDAOProtocolSettingsNode", addresses[11], abis[11]);
        _upgradeContract("rocketDAOProtocolSettingsDeposit", addresses[12], abis[12]);
        _upgradeContract("rocketDAOProtocolSettingsNetwork", addresses[13], abis[13]);
        _upgradeContract("rocketDAOProtocolSettingsSecurity", addresses[14], abis[14]);
        _upgradeContract("rocketDAOProtocolSettingsMinipool", addresses[16], abis[16]);
        _upgradeContract("rocketDAONodeTrustedUpgrade", addresses[19], abis[19]);
        _upgradeContract("rocketDAOSecurityProposals", addresses[18], abis[18]);
        _upgradeContract("rocketNodeDistributorDelegate", addresses[27], abis[27]);
        _upgradeContract("rocketRewardsPool", addresses[24], abis[24]);
        _upgradeContract("rocketClaimDAO", addresses[28], abis[28]);
        _upgradeContract("rocketMinipoolBondReducer", addresses[29], abis[29]);
        _upgradeContract("rocketMinipoolManager", addresses[30], abis[30]);
        _upgradeContract("rocketNetworkVoting", addresses[31], abis[31]);
        _upgradeContract("rocketMerkleDistributorMainnet", addresses[32], abis[32]);

        // Initialise the rewards relay address
        InitialiseInterface(addresses[32]).initialise();

        // Initialise the megapool factory
        InitialiseInterface(addresses[1]).initialise();

        // Initialise the new megapool settings contract
        InitialiseInterface(addresses[15]).initialise();

        // Add new security council allowed parameter
        setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "network", "network.node.commission.share.security.council.adder")), true);

        // Deposit settings
        {
            bytes32 settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "deposit"));
            // Set socialised assignments to 0 per RPIP-59
            setUint(keccak256(abi.encodePacked(settingNameSpace, "deposit.assign.socialised.maximum")), 0);
            // Set default express queue settings per RPIP-59
            setUint(keccak256(abi.encodePacked(settingNameSpace, "express.queue.rate")), 2);
            setUint(keccak256(abi.encodePacked(settingNameSpace, "express.queue.tickets.base.provision")), 2);
        }

        // Network settings
        {
            bytes32 settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "network"));
            // Initialise UARS setting defaults per RPIP-46
            setUint(keccak256(abi.encodePacked(settingNameSpace, "network.node.commission.share")), 0.05 ether);                        // 5% (RPIP-46)
            setUint(keccak256(abi.encodePacked(settingNameSpace, "network.node.commission.share.security.council.adder")), 0 ether);    // 0% (RPIP-46)
            setUint(keccak256(abi.encodePacked(settingNameSpace, "network.voter.share")), 0.09 ether);                                  // 9% (RPIP-46)
            setUint(keccak256(abi.encodePacked(settingNameSpace, "network.pdao.share")), 0 ether);                                      // 0% (RPIP-72)
            setUint(keccak256(abi.encodePacked(settingNameSpace, "network.max.node.commission.share.council.adder")), 0.01 ether);      // 1% (RPIP-46)
            // Initialise max rETH delta per RPIP-61
            setUint(keccak256(abi.encodePacked(settingNameSpace, "network.max.reth.balance.delta")), 0.02 ether);                       // 2% (RPIP-61)
        }

        // Node settings
        {
            bytes32 settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "node"));
            // Initialised reduced_bond and unstaking_period setting per RPIP-42 and RPIP-30
            setUint(keccak256(abi.encodePacked(settingNameSpace, "reduced.bond")), 4 ether);                    // 4 ether (RPIP-42)
            setUint(keccak256(abi.encodePacked(settingNameSpace, "node.unstaking.period")), 28 days);           // 28 days (RPIP-30)
            setUint(keccak256(abi.encodePacked(settingNameSpace, "node.megapool.minimum.stake")), 0.15 ether);  // 15% (RPIP-30)
        }

        // Minipool settings
        {
            bytes32 settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "minipool"));
            setUint(keccak256(abi.encodePacked(settingNameSpace, "minipool.maximum.penalty.count")), 2500);     // 2,500 penalties (RPIP-58)
        }

        // Security settings
        {
            bytes32 settingNameSpace = keccak256(abi.encodePacked("dao.protocol.setting.", "security"));
            // Set protocol upgrade settings per RPIP-60
            setUint(keccak256(abi.encodePacked(settingNameSpace, "upgrade.delay")), 7 days);
            setUint(keccak256(abi.encodePacked(settingNameSpace, "upgradeveto.quorum")), 0.33 ether);
        }

        // Initialise UARS system
        RocketNetworkRevenuesInterface rocketNetworkRevenuesInstance = RocketNetworkRevenuesInterface(addresses[20]);
        rocketNetworkRevenuesInstance.initialise(0.05 ether, 0.09 ether, 0); // 5% node share, 9% voter share, 0% pdao share (RPIP-46)

        // Set a protocol version value in storage for convenience with bindings
        setString(keccak256(abi.encodePacked("protocol.version")), "1.4");
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
