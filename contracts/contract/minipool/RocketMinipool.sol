pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../../interface/RocketStorageInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../types/MinipoolDeposit.sol";
import "../../types/MinipoolStatus.sol";

// An individual minipool in the Rocket Pool network

contract RocketMinipool is RocketMinipoolInterface {

    // Main Rocket Pool storage contract
    RocketStorageInterface rocketStorage = RocketStorageInterface(0);

    // Status
    MinipoolStatus public status;
    uint256 public statusBlock;

    // Deposit details
    MinipoolDeposit public depositType;
    uint256 public nodeDepositRequired;
    uint256 public userDepositRequired;

    // Node details
    address public nodeAddress;
    uint256 public nodeDepositBalance;

    // User deposit details
    uint256 public userDepositBalance;
    uint256 public userDepositBlock;

    // Staking details
    uint256 public stakingStartBalance;
    uint256 public stakingStartBlock;
    uint256 public stakingEndBalance;
    uint256 public stakingEndBlock;

    // Construct
    constructor(address _rocketStorageAddress, address _nodeAddress, MinipoolDeposit _depositType) public {
        // Check parameters
        require(_rocketStorageAddress != address(0x0), "Invalid storage address");
        require(_nodeAddress != address(0x0), "Invalid node address");
        require(_depositType != MinipoolDeposit.None, "Invalid deposit type");
        // Initialise RocketStorage
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
        // Load contracts
        RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        // Set status
        status = MinipoolStatus.Initialized;
        statusBlock = block.number;
        // Set deposit details
        depositType = _depositType;
        nodeDepositRequired = rocketMinipoolSettings.getDepositNodeAmount(_depositType);
        userDepositRequired = rocketMinipoolSettings.getDepositUserAmount(_depositType);
        // Set node details
        nodeAddress = _nodeAddress;
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
        // Check current status & node deposit balance
        require(status == MinipoolStatus.Initialized, "The node deposit can only be assigned while initialized");
        require(nodeDepositBalance == 0, "The node deposit has already been assigned");
        // Check deposit amount
        require(msg.value == nodeDepositRequired, "Invalid node deposit amount");
        // Update node deposit balance
        nodeDepositBalance = msg.value;
        // Progress full deposit minipool to prelaunch
        if (depositType == MinipoolDeposit.Full) { status = MinipoolStatus.Prelaunch; }
    }

    // Assign user deposited ETH to the minipool and mark it as prelaunch
    // Only accepts calls from the RocketMinipoolStatus contract
    function userDeposit() override external payable onlyLatestContract("rocketMinipoolStatus", msg.sender) {
        // Check current status
        if (depositType == MinipoolDeposit.Full) {
            require(status >= MinipoolStatus.Initialized && status <= MinipoolStatus.Staking, "The user deposit can only be assigned while initialized, in prelaunch, or staking");
        } else {
            require(status == MinipoolStatus.Initialized, "The user deposit can only be assigned while initialized");
        }
        // Check current user deposit balance
        require(userDepositBalance == 0, "The user deposit has already been assigned");
        // Check deposit amount
        require(msg.value == userDepositRequired, "Invalid user deposit amount");
        // Update user deposit balance
        userDepositBalance = msg.value;
        // Progress half / empty deposit minipool to prelaunch
        if (status == MinipoolStatus.Initialized) { status = MinipoolStatus.Prelaunch; }
    }

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

    // Dissolve the minipool, closing it and returning all balances to the node operator and the deposit pool
    // Only accepts calls from the RocketMinipoolStatus contract
    function dissolve() override external onlyLatestContract("rocketMinipoolStatus", msg.sender) {}

}
