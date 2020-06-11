pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../../interface/RocketStorageInterface.sol";
import "../../interface/casper/DepositInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
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
    MinipoolStatus private status;
    uint256 private statusBlock;

    // Deposit type
    MinipoolDeposit private depositType;

    // Node details
    address private nodeAddress;
    uint256 private nodeDepositBalance;
    bool private nodeDepositAssigned;

    // User deposit details
    uint256 private userDepositBalance;
    bool private userDepositAssigned;

    // Staking details
    uint256 private stakingStartBalance;
    uint256 private stakingEndBalance;
    uint256 private stakingStartBlock;
    uint256 private stakingUserStartBlock;
    uint256 private stakingEndBlock;

    // Status getters
    function getStatus() override public view returns (MinipoolStatus) { return status; }
    function getStatusBlock() override public view returns (uint256) { return statusBlock; }

    // Deposit type getter
    function getDepositType() override public view returns (MinipoolDeposit) { return depositType; }

    // Node detail getters
    function getNodeAddress() override public view returns (address) { return nodeAddress; }
    function getNodeDepositBalance() override public view returns (uint256) { return nodeDepositBalance; }
    function getNodeDepositAssigned() override public view returns (bool) { return nodeDepositAssigned; }

    // User deposit detail getters
    function getUserDepositBalance() override public view returns (uint256) { return userDepositBalance; }
    function getUserDepositAssigned() override public view returns (bool) { return userDepositAssigned; }

    // Staking detail getters
    function getStakingStartBalance() override public view returns (uint256) { return stakingStartBalance; }
    function getStakingEndBalance() override public view returns (uint256) { return stakingEndBalance; }
    function getStakingStartBlock() override public view returns (uint256) { return stakingStartBlock; }
    function getStakingUserStartBlock() override public view returns (uint256) { return stakingUserStartBlock; }
    function getStakingEndBlock() override public view returns (uint256) { return stakingEndBlock; }

    // Construct
    constructor(address _rocketStorageAddress, address _nodeAddress, MinipoolDeposit _depositType) public {
        // Check parameters
        require(_rocketStorageAddress != address(0x0), "Invalid storage address");
        require(_nodeAddress != address(0x0), "Invalid node address");
        require(_depositType != MinipoolDeposit.None, "Invalid deposit type");
        // Initialise RocketStorage
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
        // Set status
        setStatus(MinipoolStatus.Initialized);
        // Set details
        depositType = _depositType;
        nodeAddress = _nodeAddress;
    }

    // Only allow access from the owning node address
    modifier onlyMinipoolOwner(address _nodeAddress) {
        require(_nodeAddress == nodeAddress, "Invalid minipool owner");
        _;
    }

    // Only allow access from the latest version of the specified Rocket Pool contract
    modifier onlyLatestContract(string memory _contractName, address _contractAddress) {
        require(_contractAddress == getContractAddress(_contractName), "Invalid or outdated contract");
        _;
    }

    // Get the address of a Rocket Pool network contract
    function getContractAddress(string memory _contractName) private view returns(address) {
        return rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", _contractName)));
    }

    // Assign the node deposit to the minipool
    // Only accepts calls from the RocketNodeDeposit contract
    function nodeDeposit() override external payable onlyLatestContract("rocketNodeDeposit", msg.sender) {
        // Check current status & node deposit status
        require(status == MinipoolStatus.Initialized, "The node deposit can only be assigned while initialized");
        require(!nodeDepositAssigned, "The node deposit has already been assigned");
        // Load contracts
        RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        // Check deposit amount
        require(msg.value == rocketMinipoolSettings.getDepositNodeAmount(depositType), "Invalid node deposit amount");
        // Update node deposit details
        nodeDepositBalance = msg.value;
        nodeDepositAssigned = true;
        // Progress full minipool to prelaunch
        if (depositType == MinipoolDeposit.Full) { setStatus(MinipoolStatus.Prelaunch); }
    }

    // Assign user deposited ETH to the minipool and mark it as prelaunch
    // Only accepts calls from the RocketDepositPool contract
    function userDeposit() override external payable onlyLatestContract("rocketDepositPool", msg.sender) {
        // Check current status & user deposit status
        require(status >= MinipoolStatus.Initialized && status <= MinipoolStatus.Staking, "The user deposit can only be assigned while initialized, in prelaunch, or staking");
        require(!userDepositAssigned, "The user deposit has already been assigned");
        // Load contracts
        RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        // Check deposit amount
        require(msg.value == rocketMinipoolSettings.getDepositUserAmount(depositType), "Invalid user deposit amount");
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
    function stake(bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) external onlyMinipoolOwner(msg.sender) {
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
    function close() external onlyMinipoolOwner(msg.sender) {
        // Check current status
        require(status == MinipoolStatus.Withdrawable, "The minipool can only be closed while withdrawable");
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        // Destroy minipool
        rocketMinipoolManager.destroyMinipool();
        // Self destruct & send remaining balance to node
        selfdestruct(payable(nodeAddress));
    }

    // Dissolve the minipool, closing it and returning all balances to the node operator and the deposit pool
    // Only accepts calls from the RocketMinipoolStatus contract
    function dissolve() external {
        // Check current status
        require(status == MinipoolStatus.Initialized || status == MinipoolStatus.Prelaunch, "The minipool can only be dissolved while initialized or in prelaunch");
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        // Check if being dissolved by minipool owner or minipool is timed out
        require(
            msg.sender == nodeAddress ||
            (status == MinipoolStatus.Prelaunch && block.number.sub(statusBlock) >= rocketMinipoolSettings.getLaunchTimeout()),
            "The minipool can only be dissolved by its owner unless it has timed out"
        );
        // Destroy minipool
        rocketMinipoolManager.destroyMinipool();
        // Self destruct & send remaining balance to node
        selfdestruct(payable(nodeAddress));
    }

    // Set the minipool's current status
    function setStatus(MinipoolStatus _status) private {
        status = _status;
        statusBlock = block.number;
    }

}
