// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketBase} from "../RocketBase.sol";

/// @notice v1.4.1 proof verifier and megapool manager upgrade contract
contract RocketUpgradeOneDotFourDotOne is RocketBase {
    // Whether the upgrade has been performed or not
    bool internal executed = false;

    // Upgrade address and ABI
    address public beaconStateVerifierAddress;
    string public beaconStateVerifierAbi;
    address public rocketMegapoolManagerAddress;
    string public rocketMegapoolManagerAbi;

    // Construct
    constructor(
        RocketStorageInterface _rocketStorageAddress,
        address _beaconStateVerifierAddress,
        string memory _beaconStateVerifierAbi,
        address _rocketMegapoolManagerAddress,
        string memory _rocketMegapoolManagerAbi
    ) RocketBase(_rocketStorageAddress) {
        // Version
        version = 1;
        beaconStateVerifierAddress = _beaconStateVerifierAddress;
        beaconStateVerifierAbi = _beaconStateVerifierAbi;
        rocketMegapoolManagerAddress = _rocketMegapoolManagerAddress;
        rocketMegapoolManagerAbi = _rocketMegapoolManagerAbi;
    }

    /// @notice Returns the address of the RocketStorage contract
    function getRocketStorageAddress() external view returns (address) {
        return address(rocketStorage);
    }

    /// @notice Once this contract has been voted in by oDAO, guardian can perform the upgrade
    function execute() external onlyGuardian {
        require(!executed, "Already executed");
        executed = true;

        // Upgrade contracts
        _upgradeContract("beaconStateVerifier", beaconStateVerifierAddress, beaconStateVerifierAbi);
        _upgradeContract("rocketMegapoolManager", rocketMegapoolManagerAddress, rocketMegapoolManagerAbi);

        // Set a protocol version value in storage for convenience with bindings
        setString(keccak256(abi.encodePacked("protocol.version")), "1.4.1");
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
}
