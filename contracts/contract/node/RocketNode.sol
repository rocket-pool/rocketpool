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
    function getContractAddress(string memory _contractName) internal view returns(address) {
        return rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", _contractName)));
    }

    // Make a deposit to create a new minipool
    function deposit() external payable {}

    // Withdraw all staked RPL to the node owner address
    // Only accepts calls from the node owner address
    function withdrawRPL() external {
        // 1. Check that the node has no active minipools
        // 2. Slash RPL proportional to any losses incurred by minipools
        // 3. Withdraw remaining RPL to the node owner address
    }

}
