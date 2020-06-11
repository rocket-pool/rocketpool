pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../../interface/RocketStorageInterface.sol";
import "../../interface/casper/DepositInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/network/RocketNetworkWithdrawalInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../lib/SafeMath.sol";
import "../../types/MinipoolDeposit.sol";
import "../../types/MinipoolStatus.sol";

// An individual minipool in the Rocket Pool network

contract RocketMinipool is RocketMinipoolInterface {

    // Libs
    using SafeMath for uint;

    // Main Rocket Pool storage contract
    RocketStorageInterface rocketStorage = RocketStorageInterface(0);

    // Status
    MinipoolStatus public status;
    uint256 public statusBlock;

    // Deposit type
    MinipoolDeposit public depositType;

    // Node details
    address public nodeAddress;
    uint256 public nodeDepositRequired;
    uint256 public nodeDepositBalance;
    bool public nodeDepositAssigned;

    // User deposit details
    uint256 public userDepositRequired;
    uint256 public userDepositBalance;
    bool public userDepositAssigned;

    // Staking details
    uint256 public stakingStartBalance;
    uint256 public stakingEndBalance;
    uint256 public stakingStartBlock;
    uint256 public stakingUserStartBlock;
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
        setStatus(MinipoolStatus.Initialized);
        // Set details
        depositType = _depositType;
        nodeAddress = _nodeAddress;
        nodeDepositRequired = rocketMinipoolSettings.getDepositNodeAmount(_depositType);
        userDepositRequired = rocketMinipoolSettings.getDepositUserAmount(_depositType);
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
        // Check current status
        require(status == MinipoolStatus.Initialized, "The node deposit can only be assigned while initialized");
        // Check node deposit status
        require(!nodeDepositAssigned, "The node deposit has already been assigned");
        // Check deposit amount
        require(msg.value == nodeDepositRequired, "Invalid node deposit amount");
        // Update node deposit details
        nodeDepositBalance = msg.value;
        nodeDepositAssigned = true;
        // Progress full minipool to prelaunch
        if (depositType == MinipoolDeposit.Full) { setStatus(MinipoolStatus.Prelaunch); }
    }

    // Assign user deposited ETH to the minipool and mark it as prelaunch
    // Only accepts calls from the RocketMinipoolStatus contract
    function userDeposit() override external payable onlyLatestContract("rocketMinipoolStatus", msg.sender) {
        // Check current status
        require(status >= MinipoolStatus.Initialized && status <= MinipoolStatus.Staking, "The user deposit can only be assigned while initialized, in prelaunch, or staking");
        // Check user deposit status
        require(!userDepositAssigned, "The user deposit has already been assigned");
        // Check deposit amount
        require(msg.value == userDepositRequired, "Invalid user deposit amount");
        // Update user deposit details
        userDepositBalance = msg.value;
        userDepositAssigned = true;
        // Update staking details
        if (status == MinipoolStatus.Staking) { stakingUserStartBlock = block.number; }
        // Refinance full minipool
        if (depositType == MinipoolDeposit.Full) {
            // Update node deposit balance
            nodeDepositBalance = nodeDepositBalance.sub(msg.value);
            // Transfer deposited ETH to node
            payable(nodeAddress).transfer(msg.value);
        }
        // Progress initialized minipool to prelaunch
        if (status == MinipoolStatus.Initialized) { setStatus(MinipoolStatus.Prelaunch); }
    }

    // Progress the minipool to staking, sending its ETH deposit to the VRC
    // Only accepts calls from the RocketMinipoolStatus contract
    function stake(bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) override external onlyLatestContract("rocketMinipoolStatus", msg.sender) {
        // Check current status
        require(status == MinipoolStatus.Prelaunch, "The minipool can only begin staking while in prelaunch");
        // Load contracts
        DepositInterface casperDeposit = DepositInterface(getContractAddress("casperDeposit"));
        RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        RocketNetworkWithdrawalInterface rocketNetworkWithdrawal = RocketNetworkWithdrawalInterface(getContractAddress("rocketNetworkWithdrawal"));
        // Get launch amount
        uint256 launchAmount = rocketMinipoolSettings.getLaunchBalance();
        // Check minipool balance
        require(address(this).balance >= launchAmount, "Insufficient balance to begin staking");
        // Set staking details
        stakingStartBalance = launchAmount;
        stakingStartBlock = block.number;
        if (userDepositAssigned) { stakingUserStartBlock = block.number; }
        // Send staking deposit to casper
        casperDeposit.deposit{value: launchAmount}(_validatorPubkey, rocketNetworkWithdrawal.getWithdrawalCredentials(), _validatorSignature, _depositDataRoot);
        // Progress to staking
        setStatus(MinipoolStatus.Staking);
    }

    // Mark the minipool as exited
    // Only accepts calls from the RocketMinipoolStatus contract
    function exit() override external onlyLatestContract("rocketMinipoolStatus", msg.sender) {
        // Check current status
        require(status == MinipoolStatus.Staking, "The minipool can only exit while staking");
        // Progress to exited
        setStatus(MinipoolStatus.Exited);
    }

    // Mark the minipool as withdrawable and record its final balance
    // Only accepts calls from the RocketMinipoolStatus contract
    function withdraw(uint256 _withdrawalBalance) override external onlyLatestContract("rocketMinipoolStatus", msg.sender) {
        // Check current status
        require(status == MinipoolStatus.Exited, "The minipool can only withdraw while exited");
        // Update staking details
        stakingEndBalance = _withdrawalBalance;
        stakingEndBlock = block.number;
        // Progress to withdrawable
        setStatus(MinipoolStatus.Withdrawable);
    }

    // Withdraw rewards from the minipool and close it
    // Only accepts calls from the RocketMinipoolStatus contract
    function close() override external onlyLatestContract("rocketMinipoolStatus", msg.sender) {
        // Check current status
        require(status == MinipoolStatus.Withdrawable, "The minipool can only be closed while withdrawable");
    }

    // Dissolve the minipool, closing it and returning all balances to the node operator and the deposit pool
    // Only accepts calls from the RocketMinipoolStatus contract
    function dissolve() override external onlyLatestContract("rocketMinipoolStatus", msg.sender) {
        // Check current status
        require(status == MinipoolStatus.Initialized || status == MinipoolStatus.Prelaunch, "The minipool can only be dissolved while initialized or in prelaunch");
    }

    // Set the minipool's current status
    function setStatus(MinipoolStatus _status) private {
        status = _status;
        statusBlock = block.number;
    }

}
