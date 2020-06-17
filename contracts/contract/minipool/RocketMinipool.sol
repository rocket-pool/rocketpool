pragma solidity 0.6.9;

// SPDX-License-Identifier: GPL-3.0-only

import "../../interface/RocketStorageInterface.sol";
import "../../interface/casper/DepositInterface.sol";
import "../../interface/deposit/RocketDepositPoolInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/minipool/RocketMinipoolQueueInterface.sol";
import "../../interface/network/RocketNetworkFeesInterface.sol";
import "../../interface/network/RocketNetworkWithdrawalInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../interface/token/RocketNodeETHTokenInterface.sol";
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
    uint256 private statusTime;

    // Deposit type
    MinipoolDeposit private depositType;

    // Node details
    address private nodeAddress;
    uint256 private nodeFee;
    uint256 private nodeDepositBalance;
    uint256 private nodeRefundBalance;
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
    function getStatusTime() override public view returns (uint256) { return statusTime; }

    // Deposit type getter
    function getDepositType() override public view returns (MinipoolDeposit) { return depositType; }

    // Node detail getters
    function getNodeAddress() override public view returns (address) { return nodeAddress; }
    function getNodeFee() override public view returns (uint256) { return nodeFee; }
    function getNodeDepositBalance() override public view returns (uint256) { return nodeDepositBalance; }
    function getNodeRefundBalance() override public view returns (uint256) { return nodeRefundBalance; }
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
        // Load contracts
        RocketNetworkFeesInterface rocketNetworkFees = RocketNetworkFeesInterface(getContractAddress("rocketNetworkFees"));
        // Set status
        setStatus(MinipoolStatus.Initialized);
        // Set details
        depositType = _depositType;
        nodeAddress = _nodeAddress;
        nodeFee = rocketNetworkFees.getNodeFee();
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
    function getContractAddress(string memory _contractName) private view returns (address) {
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
            // Update node balances
            nodeDepositBalance = nodeDepositBalance.sub(msg.value);
            nodeRefundBalance = nodeRefundBalance.add(msg.value);
        }
        // Progress initialized minipool to prelaunch
        if (status == MinipoolStatus.Initialized) { setStatus(MinipoolStatus.Prelaunch); }
    }

    // Refund node ETH refinanced from user deposited ETH
    function refund() external onlyMinipoolOwner(msg.sender) {
        // Check refund balance
        require(nodeRefundBalance > 0, "No amount of the node deposit is available for refund");
        // Refund node
        refundNode();
    }

    // Progress the minipool to staking, sending its ETH deposit to the VRC
    // Only accepts calls from the minipool owner (node)
    function stake(bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) external onlyMinipoolOwner(msg.sender) {
        // Check current status
        require(status == MinipoolStatus.Prelaunch, "The minipool can only begin staking while in prelaunch");
        // Load contracts
        DepositInterface casperDeposit = DepositInterface(getContractAddress("casperDeposit"));
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        RocketNetworkWithdrawalInterface rocketNetworkWithdrawal = RocketNetworkWithdrawalInterface(getContractAddress("rocketNetworkWithdrawal"));
        // Get launch amount
        uint256 launchAmount = rocketMinipoolSettings.getLaunchBalance();
        // Check minipool balance
        require(address(this).balance >= launchAmount, "Insufficient balance to begin staking");
        // Check validator pubkey is not in use
        require(rocketMinipoolManager.getMinipoolByPubkey(_validatorPubkey) == address(0x0), "Validator pubkey is already in use");
        // Set staking details
        stakingStartBalance = launchAmount;
        stakingStartBlock = block.number;
        if (userDepositAssigned) { stakingUserStartBlock = block.number; }
        // Send staking deposit to casper
        casperDeposit.deposit{value: launchAmount}(_validatorPubkey, rocketNetworkWithdrawal.getWithdrawalCredentials(), _validatorSignature, _depositDataRoot);
        // Set minipool pubkey
        rocketMinipoolManager.setMinipoolPubkey(_validatorPubkey);
        // Progress to staking
        setStatus(MinipoolStatus.Staking);
    }

    // Mark the minipool as exited
    // Only accepts calls from the RocketMinipoolStatus contract
    function setExited() override external onlyLatestContract("rocketMinipoolStatus", msg.sender) {
        // Check current status
        require(status == MinipoolStatus.Staking, "The minipool can only exit while staking");
        // Load contracts
        RocketMinipoolQueueInterface rocketMinipoolQueue = RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue"));
        // Remove minipool from queue
        if (!userDepositAssigned) { rocketMinipoolQueue.removeMinipool(); }
        // Progress to exited
        setStatus(MinipoolStatus.Exited);
    }

    // Mark the minipool as withdrawable and record its final balance
    // Only accepts calls from the RocketMinipoolStatus contract
    function setWithdrawable(uint256 _withdrawalBalance) override external onlyLatestContract("rocketMinipoolStatus", msg.sender) {
        // Check current status
        require(status == MinipoolStatus.Exited, "The minipool can only become withdrawable while exited");
        // Update staking details
        stakingEndBalance = _withdrawalBalance;
        stakingEndBlock = block.number;
        // Progress to withdrawable
        setStatus(MinipoolStatus.Withdrawable);
    }

    // Withdraw node balances & rewards from the minipool and close it
    // Only accepts calls from the minipool owner (node)
    function withdraw() external onlyMinipoolOwner(msg.sender) {
        // Check current status
        require(status == MinipoolStatus.Withdrawable, "The minipool can only be withdrawn from while withdrawable");
        // Load contracts
        RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        RocketNodeETHTokenInterface rocketNodeETHToken = RocketNodeETHTokenInterface(getContractAddress("rocketNodeETHToken"));
        // Check withdrawal delay has passed
        require(block.number.sub(statusBlock) >= rocketMinipoolSettings.getWithdrawalDelay(), "The minipool cannot be withdrawn from until after the withdrawal delay period");
        // Transfer nETH balance to node operator
        uint256 nethBalance = rocketNodeETHToken.balanceOf(address(this));
        if (nethBalance > 0) { require(rocketNodeETHToken.transfer(nodeAddress, nethBalance), "nETH balance was not successfully transferred to node operator"); }
        // Transfer refunded ETH to node operator
        if (nodeRefundBalance > 0) { refundNode(); }
        // Destroy minipool
        destroy();
    }

    // Dissolve the minipool, returning user deposited ETH to the deposit pool
    // Only accepts calls from the minipool owner (node), or from any address if timed out
    function dissolve() external {
        // Check current status
        require(status == MinipoolStatus.Initialized || status == MinipoolStatus.Prelaunch, "The minipool can only be dissolved while initialized or in prelaunch");
        // Load contracts
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        RocketMinipoolQueueInterface rocketMinipoolQueue = RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue"));
        RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        // Check if being dissolved by minipool owner or minipool is timed out
        require(
            msg.sender == nodeAddress ||
            (status == MinipoolStatus.Prelaunch && block.number.sub(statusBlock) >= rocketMinipoolSettings.getLaunchTimeout()),
            "The minipool can only be dissolved by its owner unless it has timed out"
        );
        // Transfer user balance to deposit pool
        if (userDepositBalance > 0) {
            rocketDepositPool.recycleDissolvedDeposit{value: userDepositBalance}();
            userDepositBalance = 0;
        }
        // Remove minipool from queue
        if (!userDepositAssigned) { rocketMinipoolQueue.removeMinipool(); }
        // Progress to dissolved
        setStatus(MinipoolStatus.Dissolved);
    }

    // Withdraw node balances from the minipool and close it
    // Only accepts calls from the minipool owner (node)
    function close() external onlyMinipoolOwner(msg.sender) {
        // Check current status
        require(status == MinipoolStatus.Dissolved, "The minipool can only be closed while dissolved");
        // Transfer node balance to node operator
        uint256 nodeBalance = nodeDepositBalance.add(nodeRefundBalance);
        if (nodeBalance > 0) {
            // Update node balances
            nodeDepositBalance = 0;
            nodeRefundBalance = 0;
            // Transfer balance
            (bool success,) = nodeAddress.call{value: nodeBalance}("");
            require(success, "Node ETH balance was not successfully transferred to node operator");
        }
        // Destroy minipool
        destroy();
    }

    // Set the minipool's current status
    function setStatus(MinipoolStatus _status) private {
        status = _status;
        statusBlock = block.number;
        statusTime = now;
    }

    // Transfer refunded ETH balance to the node operator
    function refundNode() private {
        // Update refund balance
        uint256 refundAmount = nodeRefundBalance;
        nodeRefundBalance = 0;
        // Transfer refund amount
        (bool success,) = nodeAddress.call{value: refundAmount}("");
        require(success, "ETH refund amount was not successfully transferred to node operator");
    }

    // Destroy the minipool
    function destroy() private {
        // Destroy minipool
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        rocketMinipoolManager.destroyMinipool();
        // Self destruct & send any remaining ETH to vault
        selfdestruct(payable(getContractAddress("rocketVault")));
    }

}
