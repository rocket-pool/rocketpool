pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../../interface/RocketStorageInterface.sol";
import "../../interface/node/RocketNodeInterface.sol";

// An individual node in the Rocket Pool network

contract RocketNode is RocketNodeInterface {

	// Main Rocket Pool storage contract
    RocketStorageInterface rocketStorage = RocketStorageInterface(0);

    // Owner of the node contract
    address public owner;

	// Construct
    constructor(address _rocketStorageAddress, address _ownerAddress) public {
    	// Initialise RocketStorage
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
        // Set owner address
        owner = _ownerAddress;
    }

    // Only allow access from the latest version of the specified Rocket Pool contract
    modifier onlyLatestContract(string memory _contractName, address _contractAddress) {
        require(_contractAddress == getContractAddress(_contractName), "Invalid or outdated contract");
        _;
    }

    // Get the address of a Rocket Pool network contract
    function getContractAddress(string memory _contractName) private view returns (address) {
        return rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", _contractName)));
    }

}
