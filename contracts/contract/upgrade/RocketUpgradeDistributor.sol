pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";

import "../minipool/RocketMinipoolManager.sol";
import "../node/RocketNodeManager.sol";
import "../node/RocketNodeDistributorFactory.sol";
import "../node/RocketNodeDistributorDelegate.sol";

contract RocketUpgradeDistributor is RocketBase {

    // Whether the upgrade has been performed or not
    bool public executed;

    address public newRocketMinipoolManager;
    address public newRocketNodeManager;
    address public newRocketNodeDeposit;
    address public rocketNodeDistributorFactory;
    address public rocketNodeDistributorDelegate;

    string public newRocketMinipoolManagerAbi;
    string public newRocketNodeManagerAbi;
    string public newRocketNodeDepositAbi;
    string public rocketNodeDistributorFactoryAbi;
    string public rocketNodeDistributorDelegateAbi;

    // Construct
    constructor(
        RocketStorageInterface _rocketStorageAddress,
        address _newRocketMinipoolManager,
        address _newRocketNodeManager,
        address _newRocketNodeDeposit,
        address _rocketNodeDistributorFactory,
        address _rocketNodeDistributorDelegate,
        string memory _rocketMinipoolManagerAbi,
        string memory _rocketNodeManagerAbi,
        string memory _rocketNodeDepositAbi,
        string memory _rocketNodeDistributorFactoryAbi,
        string memory _rocketNodeDistributorDelegateAbi
    ) RocketBase(_rocketStorageAddress) {
        // Version
        version = 1;

        // Set contract addresses
        newRocketMinipoolManager = _newRocketMinipoolManager;
        newRocketNodeManager = _newRocketNodeManager;
        newRocketNodeDeposit = _newRocketNodeDeposit;
        rocketNodeDistributorFactory = _rocketNodeDistributorFactory;
        rocketNodeDistributorDelegate = _rocketNodeDistributorDelegate;

        // Set ABIs
        newRocketMinipoolManagerAbi = _rocketMinipoolManagerAbi;
        newRocketNodeManagerAbi = _rocketNodeManagerAbi;
        newRocketNodeDepositAbi = _rocketNodeDepositAbi;
        rocketNodeDistributorFactoryAbi = _rocketNodeDistributorFactoryAbi;
        rocketNodeDistributorDelegateAbi = _rocketNodeDistributorDelegateAbi;
    }

    // Once this contract has been voted in by oDAO, guardian can perform the upgrade
    function execute() external onlyGuardian {
        require(!executed, "Already executed");
        _upgradeContract("rocketMinipoolManager", newRocketMinipoolManager, newRocketMinipoolManagerAbi);
        _upgradeContract("rocketNodeManager", newRocketNodeManager, newRocketNodeManagerAbi);
        _upgradeContract("rocketNodeDeposit", newRocketNodeDeposit, newRocketNodeDepositAbi);
        _addContract("rocketNodeDistributorFactory", rocketNodeDistributorFactory, rocketNodeDistributorFactoryAbi);
        _addContract("rocketNodeDistributorDelegate", rocketNodeDistributorDelegate, rocketNodeDistributorDelegateAbi);
        executed = true;
    }

    // Add a new network contract
    function _addContract(string memory _name, address _contractAddress, string memory _contractAbi) internal {
        // Check contract name
        bytes32 nameHash = keccak256(abi.encodePacked(_name));
        require(bytes(_name).length > 0, "Invalid contract name");
        // Cannot add contract if it already exists (use upgradeContract instead)
        require(getAddress(keccak256(abi.encodePacked("contract.address", _name))) == address(0x0), "Contract name is already in use");
        // Cannot add contract if already in use as ABI only
        string memory existingAbi = getString(keccak256(abi.encodePacked("contract.abi", _name)));
        require(bytes(existingAbi).length == 0, "Contract name is already in use");
        // Check contract address
        require(_contractAddress != address(0x0), "Invalid contract address");
        require(!getBool(keccak256(abi.encodePacked("contract.exists", _contractAddress))), "Contract address is already in use");
        // Check ABI isn't empty
        require(bytes(_contractAbi).length > 0, "Empty ABI is invalid");
        // Register contract
        setBool(keccak256(abi.encodePacked("contract.exists", _contractAddress)), true);
        setString(keccak256(abi.encodePacked("contract.name", _contractAddress)), _name);
        setAddress(keccak256(abi.encodePacked("contract.address", _name)), _contractAddress);
        setString(keccak256(abi.encodePacked("contract.abi", _name)), _contractAbi);
    }

    // Upgrade a network contract
    function _upgradeContract(string memory _name, address _contractAddress, string memory _contractAbi) internal {
        // Check contract being upgraded
        bytes32 nameHash = keccak256(abi.encodePacked(_name));
        // Get old contract address & check contract exists
        address oldContractAddress = getAddress(keccak256(abi.encodePacked("contract.address", _name)));
        require(oldContractAddress != address(0x0), "Contract does not exist");
        // Check new contract address
        require(_contractAddress != address(0x0), "Invalid contract address");
        require(_contractAddress != oldContractAddress, "The contract address cannot be set to its current address");
        require(!getBool(keccak256(abi.encodePacked("contract.exists", _contractAddress))), "Contract address is already in use");
        // Check ABI isn't empty
        require(bytes(_contractAbi).length > 0, "Empty ABI is invalid");
        // Register new contract
        setBool(keccak256(abi.encodePacked("contract.exists", _contractAddress)), true);
        setString(keccak256(abi.encodePacked("contract.name", _contractAddress)), _name);
        setAddress(keccak256(abi.encodePacked("contract.address", _name)), _contractAddress);
        setString(keccak256(abi.encodePacked("contract.abi", _name)), _contractAbi);
        // Deregister old contract
        deleteString(keccak256(abi.encodePacked("contract.name", oldContractAddress)));
        deleteBool(keccak256(abi.encodePacked("contract.exists", oldContractAddress)));
    }
}
