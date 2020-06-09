pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../../interface/RocketStorageInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";

// An individual minipool in the Rocket Pool network

contract RocketMinipool is RocketMinipoolInterface {

    // Main Rocket Pool storage contract
    RocketStorageInterface rocketStorage = RocketStorageInterface(0);

    // Node properties
    address public node;
    uint256 public nodeDepositAmount;

    // Construct
    constructor(address _rocketStorageAddress, address _nodeAddress, uint256 _nodeDepositAmount) public {
        // Initialise RocketStorage
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
        // Set properties
        node = _nodeAddress;
        nodeDepositAmount = _nodeDepositAmount;
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

    // Assign the node deposit to the minipool
    // Only accepts calls from the RocketMinipoolStatus contract
    function nodeDeposit() override external payable onlyLatestContract("rocketMinipoolStatus", msg.sender) {
        // Check deposit amount
        require(msg.value == nodeDepositAmount, "Invalid node deposit amount");
    }

    // Assign user deposited ETH to the minipool and mark it as prelaunch
    // Only accepts calls from the RocketMinipoolStatus contract
    function userDeposit() override external payable onlyLatestContract("rocketMinipoolStatus", msg.sender) {}

    // Progress the minipool to staking, sending its ETH deposit to the VRC
    // Only accepts calls from the RocketMinipoolStatus contract
    function stake(bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) override external onlyLatestContract("rocketMinipoolStatus", msg.sender) {}

    // Mark the minipool as exited
    // Only accepts calls from the RocketMinipoolStatus contract
    function exit() override external onlyLatestContract("rocketMinipoolStatus", msg.sender) {}

    // Mark the minipool as withdrawable and record its final balance
    // Only accepts calls from the RocketMinipoolStatus contract
    function withdraw(uint256 _withdrawalBalance) override external onlyLatestContract("rocketMinipoolStatus", msg.sender) {}

    // Withdraw rewards from the minipool and close it
    // Only accepts calls from the RocketMinipoolStatus contract
    function close() override external onlyLatestContract("rocketMinipoolStatus", msg.sender) {}

    // Time the minipool out, closing it and returning all balances to the node operator and the deposit pool
    // Only accepts calls from the RocketMinipoolStatus contract
    function timeout() override external onlyLatestContract("rocketMinipoolStatus", msg.sender) {}

}
