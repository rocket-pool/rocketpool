pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./RocketBase.sol";
import "../interface/RocketUpgradeInterface.sol";

// Handles network contract upgrades
// TODO: replace with governance model before mainnet release

contract RocketUpgrade is RocketBase, RocketUpgradeInterface {

    // Events
    event ContractUpgraded(bytes32 indexed name, address indexed oldAddress, address indexed newAddress, uint256 time);
    event ContractAdded(bytes32 indexed name, address indexed newAddress, uint256 time);
    event ABIUpgraded(bytes32 indexed name, uint256 time);
    event ABIAdded(bytes32 indexed name, uint256 time);

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    // Upgrade a network contract
    function upgradeContract(string memory _name, address _contractAddress, string memory _contractAbi) override external onlyLatestContract("rocketUpgrade", address(this)) onlyGuardian {
        // Check contract being upgraded
        bytes32 nameHash = keccak256(abi.encodePacked(_name));
        require(nameHash != keccak256(abi.encodePacked("rocketVault")),        "Cannot upgrade the vault");
        require(nameHash != keccak256(abi.encodePacked("rocketPoolToken")),    "Cannot upgrade token contracts");
        require(nameHash != keccak256(abi.encodePacked("rocketTokenRETH")),     "Cannot upgrade token contracts");
        require(nameHash != keccak256(abi.encodePacked("rocketTokenNETH")), "Cannot upgrade token contracts");
        require(nameHash != keccak256(abi.encodePacked("casperDeposit")),      "Cannot upgrade the casper deposit contract");
        // Get old contract address & check contract exists
        address oldContractAddress = getAddress(keccak256(abi.encodePacked("contract.address", _name)));
        require(oldContractAddress != address(0x0), "Contract does not exist");
        // Check new contract address
        require(_contractAddress != address(0x0), "Invalid contract address");
        require(_contractAddress != oldContractAddress, "The contract address cannot be set to its current address");
        // Check contract balances
        //require(oldContractAddress.balance == 0, "The existing contract has an ETH balance");
        //require(IERC20(getContractAddress("rocketPoolToken")).balanceOf(oldContractAddress) == 0, "The existing contract has an RPL balance");
        //require(IERC20(getContractAddress("rocketTokenRETH")).balanceOf(oldContractAddress) == 0, "The existing contract has a rETH balance");
        //require(ERC20(getContractAddress("rocketTokenNETH")).balanceOf(oldContractAddress) == 0, "The existing contract has a nETH balance");
        // Register new contract
        setBool(keccak256(abi.encodePacked("contract.exists", _contractAddress)), true);
        setString(keccak256(abi.encodePacked("contract.name", _contractAddress)), _name);
        setAddress(keccak256(abi.encodePacked("contract.address", _name)), _contractAddress);
        setString(keccak256(abi.encodePacked("contract.abi", _name)), _contractAbi);
        // Deregister old contract
        deleteString(keccak256(abi.encodePacked("contract.name", oldContractAddress)));
        deleteBool(keccak256(abi.encodePacked("contract.exists", oldContractAddress)));
        // Emit contract upgraded event
        emit ContractUpgraded(nameHash, oldContractAddress, _contractAddress, block.timestamp);
    }

    // Add a new network contract
    function addContract(string memory _name, address _contractAddress, string memory _contractAbi) override external onlyLatestContract("rocketUpgrade", address(this)) onlyGuardian {
        // Check contract name
        bytes32 nameHash = keccak256(abi.encodePacked(_name));
        require(nameHash != keccak256(abi.encodePacked("")), "Invalid contract name");
        require(getAddress(keccak256(abi.encodePacked("contract.address", _name))) == address(0x0), "Contract name is already in use");
        string memory existingAbi = getString(keccak256(abi.encodePacked("contract.abi", _name)));
        require(keccak256(abi.encodePacked(existingAbi)) == keccak256(abi.encodePacked("")), "Contract name is already in use");
        // Check contract address
        require(_contractAddress != address(0x0), "Invalid contract address");
        require(!getBool(keccak256(abi.encodePacked("contract.exists", _contractAddress))), "Contract address is already in use");
        // Register contract
        setBool(keccak256(abi.encodePacked("contract.exists", _contractAddress)), true);
        setString(keccak256(abi.encodePacked("contract.name", _contractAddress)), _name);
        setAddress(keccak256(abi.encodePacked("contract.address", _name)), _contractAddress);
        setString(keccak256(abi.encodePacked("contract.abi", _name)), _contractAbi);
        // Emit contract added event
        emit ContractAdded(nameHash, _contractAddress, block.timestamp);
    }

    // Upgrade a network contract ABI
    function upgradeABI(string memory _name, string memory _contractAbi) override external onlyLatestContract("rocketUpgrade", address(this)) onlyGuardian {
        // Check ABI exists
        string memory existingAbi = getString(keccak256(abi.encodePacked("contract.abi", _name)));
        require(keccak256(abi.encodePacked(existingAbi)) != keccak256(abi.encodePacked("")), "ABI does not exist");
        // Set ABI
        setString(keccak256(abi.encodePacked("contract.abi", _name)), _contractAbi);
        // Emit ABI upgraded event
        emit ABIUpgraded(keccak256(abi.encodePacked(_name)), block.timestamp);
    }

    // Add a new network contract ABI
    function addABI(string memory _name, string memory _contractAbi) override external onlyLatestContract("rocketUpgrade", address(this)) onlyGuardian {
        // Check ABI name
        bytes32 nameHash = keccak256(abi.encodePacked(_name));
        require(nameHash != keccak256(abi.encodePacked("")), "Invalid ABI name");
        require(getAddress(keccak256(abi.encodePacked("contract.address", _name))) == address(0x0), "ABI name is already in use");
        string memory existingAbi = getString(keccak256(abi.encodePacked("contract.abi", _name)));
        require(keccak256(abi.encodePacked(existingAbi)) == keccak256(abi.encodePacked("")), "ABI name is already in use");
        // Set ABI
        setString(keccak256(abi.encodePacked("contract.abi", _name)), _contractAbi);
        // Emit ABI added event
        emit ABIAdded(nameHash, block.timestamp);
    }

}
