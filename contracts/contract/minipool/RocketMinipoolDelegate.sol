pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "./RocketMinipoolStorageLayout.sol";
import "../../interface/casper/DepositInterface.sol";
import "../../interface/deposit/RocketDepositPoolInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/minipool/RocketMinipoolQueueInterface.sol";
import "../../interface/minipool/RocketMinipoolPenaltyInterface.sol";
import "../../interface/node/RocketNodeManagerInterface.sol";
import "../../interface/node/RocketNodeStakingInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import "../../interface/network/RocketNetworkFeesInterface.sol";
import "../../types/MinipoolDeposit.sol";
import "../../types/MinipoolStatus.sol";

// An individual minipool in the Rocket Pool network

contract RocketMinipoolDelegate is RocketMinipoolStorageLayout, RocketMinipoolInterface {

    // Constants
    uint256 constant calcBase = 1 ether;
    uint256 constant distributionCooldown = 100;                  // Number of blocks that must pass between calls to distributeBalance

    // Libs
    using SafeMath for uint;

    // Events
    event StatusUpdated(uint8 indexed status, uint256 time);
    event EtherDeposited(address indexed from, uint256 amount, uint256 time);
    event EtherWithdrawn(address indexed to, uint256 amount, uint256 time);
    event EtherWithdrawalProcessed(address indexed executed, uint256 nodeAmount, uint256 userAmount, uint256 totalBalance, uint256 time);

    // Status getters
    function getStatus() override external view returns (MinipoolStatus) { return status; }
    function getStatusBlock() override external view returns (uint256) { return statusBlock; }
    function getStatusTime() override external view returns (uint256) { return statusTime; }

    // Deposit type getter
    function getDepositType() override external view returns (MinipoolDeposit) { return depositType; }

    // Node detail getters
    function getNodeAddress() override external view returns (address) { return nodeAddress; }
    function getNodeFee() override external view returns (uint256) { return nodeFee; }
    function getNodeDepositBalance() override external view returns (uint256) { return nodeDepositBalance; }
    function getNodeRefundBalance() override external view returns (uint256) { return nodeRefundBalance; }
    function getNodeDepositAssigned() override external view returns (bool) { return nodeDepositAssigned; }

    // User deposit detail getters
    function getUserDepositBalance() override external view returns (uint256) { return userDepositBalance; }
    function getUserDepositAssigned() override external view returns (bool) { return userDepositAssignedTime != 0; }
    function getUserDepositAssignedTime() override external view returns (uint256) { return userDepositAssignedTime; }

    // Get the withdrawal credentials for the minipool contract
    function getWithdrawalCredentials() override public view returns (bytes memory) {
        return abi.encodePacked(byte(0x01), bytes11(0x0), address(this));
    }

    // Prevent direct calls to this contract
    modifier onlyInitialised() {
        require(storageState == StorageState.Initialised, "Storage state not initialised");
        _;
    }

    modifier onlyUninitialised() {
        require(storageState == StorageState.Uninitialised, "Storage state already initialised");
        _;
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
        address contractAddress = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", _contractName)));
        require(contractAddress != address(0x0), "Contract not found");
        return contractAddress;
    }

    function initialise(address _nodeAddress, MinipoolDeposit _depositType) override external onlyUninitialised {
        // Check parameters
        require(_nodeAddress != address(0x0), "Invalid node address");
        require(_depositType != MinipoolDeposit.None, "Invalid deposit type");
        // Load contracts
        RocketNetworkFeesInterface rocketNetworkFees = RocketNetworkFeesInterface(getContractAddress("rocketNetworkFees"));
        // Set initial status
        status = MinipoolStatus.Initialized;
        statusBlock = block.number;
        statusTime = block.timestamp;
        // Set details
        depositType = _depositType;
        nodeAddress = _nodeAddress;
        nodeFee = rocketNetworkFees.getNodeFee();
        // Set the rETH address
        rocketTokenRETH = getContractAddress("rocketTokenRETH");
        // Intialise storage state
        storageState = StorageState.Initialised;
    }

    // Assign the node deposit to the minipool
    // Only accepts calls from the RocketNodeDeposit contract
    function nodeDeposit() override external payable onlyLatestContract("rocketNodeDeposit", msg.sender) onlyInitialised {
        // Check current status & node deposit status
        require(status == MinipoolStatus.Initialized, "The node deposit can only be assigned while initialized");
        require(!nodeDepositAssigned, "The node deposit has already been assigned");
        // Progress full minipool to prelaunch
        if (depositType == MinipoolDeposit.Full) { setStatus(MinipoolStatus.Prelaunch); }
        // Update node deposit details
        nodeDepositBalance = msg.value;
        nodeDepositAssigned = true;
        // Emit ether deposited event
        emit EtherDeposited(msg.sender, msg.value, block.timestamp);
    }

    // Assign user deposited ETH to the minipool and mark it as prelaunch
    // Only accepts calls from the RocketDepositPool contract
    function userDeposit() override external payable onlyLatestContract("rocketDepositPool", msg.sender) onlyInitialised {
        // Check current status & user deposit status
        require(status >= MinipoolStatus.Initialized && status <= MinipoolStatus.Staking, "The user deposit can only be assigned while initialized, in prelaunch, or staking");
        require(userDepositAssignedTime == 0, "The user deposit has already been assigned");
        // Progress initialized minipool to prelaunch
        if (status == MinipoolStatus.Initialized) { setStatus(MinipoolStatus.Prelaunch); }
        // Update user deposit details
        userDepositBalance = msg.value;
        userDepositAssignedTime = block.timestamp;
        // Refinance full minipool
        if (depositType == MinipoolDeposit.Full) {
            // Update node balances
            nodeDepositBalance = nodeDepositBalance.sub(msg.value);
            nodeRefundBalance = nodeRefundBalance.add(msg.value);
        }
        // Emit ether deposited event
        emit EtherDeposited(msg.sender, msg.value, block.timestamp);
    }

    // Refund node ETH refinanced from user deposited ETH
    function refund() override external onlyMinipoolOwner(msg.sender) onlyInitialised {
        // Check refund balance
        require(nodeRefundBalance > 0, "No amount of the node deposit is available for refund");
        // Refund node
        _refund();
    }

    // Called to slash node operator's RPL balance if withdrawal balance was less than user deposit
    function slash() external override onlyInitialised {
        // Check there is a slash balance
        require(nodeSlashBalance > 0, "No balance to slash");
        // Perform slash
        _slash();
    }

    // Owner can call to destroy the minipool, freeing up locked RPL to withdraw
    function destroy() external override onlyInitialised {
        // Check status
        require(status == MinipoolStatus.Withdrawable, "Minipool must be withdrawable to destroy");
        // Check distributeBalance has been called at least once
        require(withdrawalBlock > 0, "Minipool must have been withdrawn before destroying");
        // Check if owner's RPL requires slashing and slash it
        if (nodeSlashBalance > 0) {
            _slash();
        }
        // Destroy
        _destroy();
    }

    // Progress the minipool to staking, sending its ETH deposit to the VRC
    // Only accepts calls from the minipool owner (node)
    function stake(bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) override external onlyMinipoolOwner(msg.sender) onlyInitialised {
        // Check current status
        require(status == MinipoolStatus.Prelaunch, "The minipool can only begin staking while in prelaunch");
        // Progress to staking
        setStatus(MinipoolStatus.Staking);
        // Load contracts
        DepositInterface casperDeposit = DepositInterface(getContractAddress("casperDeposit"));
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        // Get launch amount
        uint256 launchAmount = rocketDAOProtocolSettingsMinipool.getLaunchBalance();
        // Check minipool balance
        require(address(this).balance >= launchAmount, "Insufficient balance to begin staking");
        // Check validator pubkey is not in use
        require(rocketMinipoolManager.getMinipoolByPubkey(_validatorPubkey) == address(0x0), "Validator pubkey is already in use");
        // Set minipool pubkey
        rocketMinipoolManager.setMinipoolPubkey(_validatorPubkey);
        // Send staking deposit to casper
        casperDeposit.deposit{value: launchAmount}(_validatorPubkey, getWithdrawalCredentials(), _validatorSignature, _depositDataRoot);
        // Progress to staking
        setStatus(MinipoolStatus.Staking);
        // Increment node's number of staking minipools
        rocketMinipoolManager.incrementNodeStakingMinipoolCount(nodeAddress);
    }

    // Mark the minipool as withdrawable
    // Only accepts calls from the RocketMinipoolStatus contract
    function setWithdrawable() override external onlyLatestContract("rocketMinipoolStatus", msg.sender) onlyInitialised {
        // Get contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        // Check current status
        require(status == MinipoolStatus.Staking, "The minipool can only become withdrawable while staking");
        // Progress to withdrawable
        setStatus(MinipoolStatus.Withdrawable);
        // Remove minipool from queue
        if (userDepositAssignedTime == 0) {
            // User deposit was never assigned so it still exists in queue, remove it
            RocketMinipoolQueueInterface rocketMinipoolQueue = RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue"));
            rocketMinipoolQueue.removeMinipool(depositType);
        }
        // Decrements node's number of staking minipools
        rocketMinipoolManager.decrementNodeStakingMinipoolCount(nodeAddress);
    }

    // Processes a withdrawal and then destroys in a single transaction
    // Can only be called by owner (_destroy reverts if not called by owner)
    function distributeBalanceAndDestroy() override external onlyInitialised {
        // Check status
        require(status == MinipoolStatus.Withdrawable, "Minipool must be withdrawable to destroy");
        // Get withdrawal amount, we must also account for a possible node refund balance on the contract from users staking 32 ETH that have received a 16 ETH refund after the protocol bought out 16 ETH
        uint256 totalBalance = address(this).balance.sub(nodeRefundBalance);
        // Process withdrawal
        _distributeBalance(totalBalance);
        // If slash is required then perform it
        if (nodeSlashBalance > 0) {
            _slash();
        }
        // Destroy the pool
        _destroy();
    }

    // Processes a withdrawal
    // When called during staking status, requires 16 ether in the pool
    // When called by non-owner with less than 16 ether, requires 7 days to have passed since being made withdrawable
    function distributeBalance() override external onlyInitialised {
        // Must be called while staking or withdrawable
        require(status == MinipoolStatus.Staking || status == MinipoolStatus.Withdrawable, "Minipool must be staking or withdrawable");
        // Get withdrawal amount, we must also account for a possible node refund balance on the contract from users staking 32 ETH that have received a 16 ETH refund after the protocol bought out 16 ETH
        uint256 totalBalance = address(this).balance.sub(nodeRefundBalance);
        // Get node withdrawal address
        address nodeWithdrawalAddress = rocketStorage.getNodeWithdrawalAddress(nodeAddress);
        // If minipool is still staking
        if (status == MinipoolStatus.Staking) {
            // Then this can only be run if balance >= 16 ether
            require(msg.sender == nodeAddress || msg.sender == nodeWithdrawalAddress || totalBalance >= 16 ether, "Minipool does not have enough ETH to process a withdrawal");
        } else {
            // If it's not the node operator calling and less than 16 ether in pool
            if ((msg.sender != nodeAddress && msg.sender != nodeWithdrawalAddress) && totalBalance < 16 ether) {
                // Then enough blocks have to have elapsed
                require(block.timestamp > statusTime.add(7 days), "Non-owner must wait longer to process sub 16 ETH withdrawal");
            }
        }
        // Process withdrawal
        _distributeBalance(totalBalance);
    }

    function _distributeBalance(uint256 _balance) private {
        // Rate limit this method to prevent front running
        require(block.number > withdrawalBlock + distributeBalance, "Distribution of this minipool's balance is on cooldown");
        // Deposit amounts
        uint256 stakingDepositTotal = 32 ether;
        uint256 userAmount = userDepositBalance;
        // Check if node operator was slashed
        if (userAmount > _balance) {
            // Record shortfall
            nodeSlashBalance = userAmount.sub(_balance);
            // Send remaining amount to user
            userAmount = _balance;
        }
        // Check if there are rewards to pay out
        else if (_balance > stakingDepositTotal) {
            // Calculate rewards earned
            uint256 totalRewards = _balance.sub(stakingDepositTotal);
            // Calculate node share of rewards for the user
            uint256 halfRewards = totalRewards.div(2);
            uint256 nodeCommissionFee = halfRewards.mul(nodeFee).div(1 ether);
            // Add user's share of rewards to their running total
            userAmount = userAmount.add(halfRewards.sub(nodeCommissionFee));
        }
        // Calculate node amount as what's left over after user amount
        uint256 nodeAmount = _balance.sub(userAmount);
        // Check if node has an ETH penalty
        uint256 penaltyRate = RocketMinipoolPenaltyInterface(rocketMinipoolPenalty).getPenaltyRate(address(this));
        if (penaltyRate > 0) {
            uint256 penaltyAmount = nodeAmount.mul(penaltyRate).div(calcBase);
            if (penaltyAmount > nodeAmount) {
                penaltyAmount = nodeAmount;
            }
            nodeAmount = nodeAmount.sub(penaltyAmount);
            userAmount = userAmount.add(penaltyAmount);
        }
        // Pay node operator via refund
        nodeRefundBalance = nodeRefundBalance.add(nodeAmount);
        // Send user amount to rETH contract
        payable(rocketTokenRETH).transfer(userAmount);
        // Save block to prevent multiple withdrawals within a few blocks
        withdrawalBlock = block.number;
        // Log it
        emit EtherWithdrawalProcessed(msg.sender, nodeAmount, userAmount, _balance, block.timestamp);
    }

    // Dissolve the minipool, returning user deposited ETH to the deposit pool
    // Only accepts calls from the minipool owner (node), or from any address if timed out
    function dissolve() override external onlyInitialised {
        // Check current status
        require(status == MinipoolStatus.Initialized || status == MinipoolStatus.Prelaunch, "The minipool can only be dissolved while initialized or in prelaunch");
        // Load contracts
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        RocketMinipoolQueueInterface rocketMinipoolQueue = RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue"));
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        // Check if being dissolved by minipool owner or minipool is timed out
        require(
            msg.sender == nodeAddress ||
            (status == MinipoolStatus.Prelaunch && block.number.sub(statusBlock) >= rocketDAOProtocolSettingsMinipool.getLaunchTimeout()),
            "The minipool can only be dissolved by its owner unless it has timed out"
        );
        // Progress to dissolved
        setStatus(MinipoolStatus.Dissolved);
        // Transfer user balance to deposit pool
        if (userDepositBalance > 0) {
            // Store value in local
            uint256 recycleAmount = userDepositBalance;
            // Clear storage
            userDepositBalance = 0;
            userDepositAssignedTime = 0;
            // Transfer
            rocketDepositPool.recycleDissolvedDeposit{value: recycleAmount}();
            // Emit ether withdrawn event
            emit EtherWithdrawn(address(rocketDepositPool), recycleAmount, block.timestamp);
        } else {
            rocketMinipoolQueue.removeMinipool(depositType);
        }
    }

    // Withdraw node balances from the minipool and close it
    // Only accepts calls from the minipool owner (node)
    function close() override external onlyMinipoolOwner(msg.sender) onlyInitialised {
        // Check current status
        require(status == MinipoolStatus.Dissolved, "The minipool can only be closed while dissolved");
        // Transfer node balance to node operator
        uint256 nodeBalance = nodeDepositBalance.add(nodeRefundBalance);
        if (nodeBalance > 0) {
            // Update node balances
            nodeDepositBalance = 0;
            nodeRefundBalance = 0;
            // Get node withdrawal address
            address nodeWithdrawalAddress = rocketStorage.getNodeWithdrawalAddress(nodeAddress);
            // Transfer balance
            (bool success,) = nodeWithdrawalAddress.call{value: nodeBalance}("");
            require(success, "Node ETH balance was not successfully transferred to node operator");
            // Emit ether withdrawn event
            emit EtherWithdrawn(nodeWithdrawalAddress, nodeBalance, block.timestamp);
        }
        // Destroy minipool
        _destroy();
    }

    // Set the minipool's current status
    function setStatus(MinipoolStatus _status) private {
        // Update status
        status = _status;
        statusBlock = block.number;
        statusTime = block.timestamp;
        // Emit status updated event
        emit StatusUpdated(uint8(_status), block.timestamp);
    }

    // Transfer refunded ETH balance to the node operator
    function _refund() private {
        // Update refund balance
        uint256 refundAmount = nodeRefundBalance;
        nodeRefundBalance = 0;
        // Get node withdrawal address
        address nodeWithdrawalAddress = rocketStorage.getNodeWithdrawalAddress(nodeAddress);
        // Transfer refund amount
        (bool success,) = nodeWithdrawalAddress.call{value: refundAmount}("");
        require(success, "ETH refund amount was not successfully transferred to node operator");
        // Emit ether withdrawn event
        emit EtherWithdrawn(nodeWithdrawalAddress, refundAmount, block.timestamp);
    }

    // Destroy the minipool
    function _destroy() private {
        // Destroy minipool
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        rocketMinipoolManager.destroyMinipool();
        // Update refund balance
        uint256 refundAmount = nodeRefundBalance;
        nodeRefundBalance = 0;
        // Get node withdrawal address
        address nodeWithdrawalAddress = rocketStorage.getNodeWithdrawalAddress(nodeAddress);
        // Only the owner can destroy a minipool
        require(nodeWithdrawalAddress == msg.sender || nodeAddress == msg.sender, "Only node operator can destroy minipool");
        // Send any remaining balance to rETH contract
        payable(rocketTokenRETH).transfer(address(this).balance.sub(refundAmount));
        // Self destruct the refund amount to node withdrawal address
        selfdestruct(payable(nodeWithdrawalAddress));
    }

    // Slash node operator's RPL balance based on nodeSlashBalance
    function _slash() private {
        // Get contracts
        RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
        // Slash required amount and reset storage value
        uint256 slashAmount = nodeSlashBalance;
        nodeSlashBalance = 0;
        rocketNodeStaking.slashRPL(nodeAddress, slashAmount);
    }
}
