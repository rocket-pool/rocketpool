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
    bool internal executed = false;

    // The deployer address
    address internal deployer;

    // Upgrade ABIs (split into 2 parts to avoid gas limit)
    bool public lockedA = false;
    address[17] public addressesA;
    string[17] public abisA;

    bool public lockedB = false;
    address[17] public addressesB;
    string[17] public abisB;

    // Construct
    constructor(
        RocketStorageInterface _rocketStorageAddress
    ) RocketBase(_rocketStorageAddress) {
        // Version
        version = 1;
        deployer = msg.sender;
    }

    // @notice Sets the A addresses and ABIs of the upgrade
    function setA(
        address[17] memory _addressesA,
        string[17] memory _abisA
    ) external {
        require(msg.sender == deployer, "Only deployer can set");
        require(!lockedA, "Already set");
        lockedA = true;
        addressesA = _addressesA;
        abisA = _abisA;
    }

    // @notice Sets the B addresses and ABIs of the upgrade
    function setB(
        address[17] memory _addressesB,
        string[17] memory _abisB
    ) external {
        require(msg.sender == deployer, "Only deployer can set");
        require(!lockedB, "Already set");
        lockedB = true;
        addressesB = _addressesB;
        abisB = _abisB;
    }

    /// @notice Returns the address of the RocketStorage contract
    function getRocketStorageAddress() external view returns (address) {
        return address(rocketStorage);
    }

    /// @notice Once this contract has been voted in by oDAO, guardian can perform the upgrade
    function execute() external onlyGuardian {
        require(lockedA && lockedB, "Addresses not set");
        require(!executed, "Already executed");
        executed = true;

        // Add new contracts
        _addContract("rocketMegapoolDelegate", addressesA[0], abisA[0]);
        _addContract("rocketMegapoolFactory", addressesA[1], abisA[1]);
        _addContract("rocketMegapoolProxy", addressesA[2], abisA[2]);
        _addContract("rocketMegapoolManager", addressesA[3], abisA[3]);
        _addContract("linkedListStorage", addressesA[8], abisA[8]);
        _addContract("rocketNetworkRevenues", addressesB[3], abisB[3]);
        _addContract("beaconStateVerifier", addressesB[8], abisB[8]);
        _addContract("rocketDAOProtocolSettingsMegapool", addressesA[15], abisA[15]);
        _addContract("rocketDAOSecurityUpgrade", addressesB[0], abisB[0]);
        _addContract("rocketMegapoolPenalties", addressesB[15], abisB[15]);
        _addContract("rocketNetworkSnapshotsTime", addressesB[16], abisB[16]);

        // Upgrade existing contracts
        _upgradeContract("rocketNodeManager", addressesA[4], abisA[4]);
        _upgradeContract("rocketNodeDeposit", addressesA[5], abisA[5]);
        _upgradeContract("rocketNodeStaking", addressesA[6], abisA[6]);
        _upgradeContract("rocketNetworkBalances", addressesB[4], abisB[4]);
        _upgradeContract("rocketNetworkPenalties", addressesB[6], abisB[6]);
        _upgradeContract("rocketDepositPool", addressesA[7], abisA[7]);
        _upgradeContract("rocketNetworkSnapshots", addressesB[5], abisB[5]);
        _upgradeContract("rocketDAOProtocol", addressesA[9], abisA[9]);
        _upgradeContract("rocketDAOProtocolProposals", addressesA[10], abisA[10]);
        _upgradeContract("rocketDAOProtocolSettingsNode", addressesA[11], abisA[11]);
        _upgradeContract("rocketDAOProtocolSettingsDeposit", addressesA[12], abisA[12]);
        _upgradeContract("rocketDAOProtocolSettingsNetwork", addressesA[13], abisA[13]);
        _upgradeContract("rocketDAOProtocolSettingsSecurity", addressesA[14], abisA[14]);
        _upgradeContract("rocketDAOProtocolSettingsMinipool", addressesA[16], abisA[16]);
        _upgradeContract("rocketDAONodeTrustedUpgrade", addressesB[2], abisB[2]);
        _upgradeContract("rocketDAOSecurityProposals", addressesB[1], abisB[1]);
        _upgradeContract("rocketNodeDistributorDelegate", addressesB[9], abisB[9]);
        _upgradeContract("rocketRewardsPool", addressesB[7], abisB[7]);
        _upgradeContract("rocketClaimDAO", addressesB[10], abisB[10]);
        _upgradeContract("rocketMinipoolBondReducer", addressesB[11], abisB[11]);
        _upgradeContract("rocketMinipoolManager", addressesB[12], abisB[12]);
        _upgradeContract("rocketNetworkVoting", addressesB[13], abisB[13]);
        _upgradeContract("rocketMerkleDistributorMainnet", addressesB[14], abisB[14]);

        // Initialise the rewards relay address
        InitialiseInterface(addressesB[14]).initialise();

        // Initialise the megapool factory
        InitialiseInterface(addressesA[1]).initialise();

        // Initialise the new megapool settings contract
        InitialiseInterface(addressesA[15]).initialise();

        // Add new security council allowed parameter
        setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "network", "network.node.commission.share.security.council.adder")), true);

        // Add missing security council permission for rewards submission enabled
        setBool(keccak256(abi.encodePacked("dao.security.allowed.setting", "network", "network.submit.rewards.enabled")), true);

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
            setUint(keccak256(abi.encodePacked(settingNameSpace, "reduced.bond")), 4 ether);                          // 4 ether (RPIP-42)
            setUint(keccak256(abi.encodePacked(settingNameSpace, "node.unstaking.period")), 28 days);                 // 28 days (RPIP-30)
            setUint(keccak256(abi.encodePacked(settingNameSpace, "node.withdrawal.cooldown")), 0);                    // No cooldown (RPIP-30)
            setUint(keccak256(abi.encodePacked(settingNameSpace, "node.minimum.legacy.staked.rpl")), 0.15 ether);     // 15% (RPIP-30)
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
        RocketNetworkRevenuesInterface rocketNetworkRevenuesInstance = RocketNetworkRevenuesInterface(addressesB[3]);
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
