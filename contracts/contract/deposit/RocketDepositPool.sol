// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

import "../../interface/RocketVaultInterface.sol";
import "../../interface/RocketVaultWithdrawerInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsDepositInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";
import "../../interface/deposit/RocketDepositPoolInterface.sol";
import "../../interface/megapool/RocketMegapoolInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolQueueInterface.sol";
import "../../interface/node/RocketNodeManagerInterface.sol";
import "../../interface/token/RocketTokenRETHInterface.sol";
import "../../interface/util/AddressQueueStorageInterface.sol";
import "../../interface/util/LinkedListStorageInterface.sol";
import "../../types/MinipoolDeposit.sol";
import "../RocketBase.sol";
import {RocketNodeStakingInterface} from "../../interface/node/RocketNodeStakingInterface.sol";

import "hardhat/console.sol";
import {RocketMegapoolFactoryInterface} from "../../interface/megapool/RocketMegapoolFactoryInterface.sol";

/// @notice Accepts user deposits and mints rETH; handles assignment of deposited ETH to minipools
contract RocketDepositPool is RocketBase, RocketDepositPoolInterface, RocketVaultWithdrawerInterface {

    // Constants
    uint256 private constant milliToWei = 10**15;
    bytes32 private constant queueKeyVariable = keccak256("minipools.available.variable");
    bytes32 private constant expressQueueNamespace = keccak256("deposit.queue.express");
    bytes32 private constant standardQueueNamespace = keccak256("deposit.queue.standard");

    // Immutables
    RocketVaultInterface immutable internal rocketVault;
    RocketTokenRETHInterface immutable internal rocketTokenRETH;

    // Events
    event DepositReceived(address indexed from, uint256 amount, uint256 time);
    event DepositRecycled(address indexed from, uint256 amount, uint256 time);
    event DepositAssigned(address indexed minipool, uint256 amount, uint256 time);
    event ExcessWithdrawn(address indexed to, uint256 amount, uint256 time);

    // Structs
    struct MinipoolAssignment {
        address minipoolAddress;
        uint256 etherAssigned;
    }

    // Modifiers
    modifier onlyThisLatestContract() {
        // Compiler can optimise out this keccak at compile time
        require(address(this) == getAddress(keccak256("contract.addressrocketDepositPool")), "Invalid or outdated contract");
        _;
    }

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 3;

        // Pre-retrieve non-upgradable contract addresses to save gas
        rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        rocketTokenRETH = RocketTokenRETHInterface(getContractAddress("rocketTokenRETH"));

        // Precompute common keys
    }

    /// @notice Returns the current deposit pool balance
    function getBalance() override public view returns (uint256) {
        return rocketVault.balanceOf("rocketDepositPool");
    }

    /// @notice Returns the amount of ETH contributed to the deposit pool by node operators waiting in the queue
    function getNodeBalance() override public view returns (uint256) {
        return getUint("deposit.pool.node.balance");
    }

    /// @notice Returns the user owned portion of the deposit pool (negative indicates more ETH has been "lent" to the
    ///         deposit pool by node operators in the queue than is available from user deposits)
    function getUserBalance() override public view returns (int256) {
        return int256(getBalance()) - int256(getNodeBalance());
    }

    /// @notice Excess deposit pool balance (in excess of minipool queue capacity)
    function getExcessBalance() override public view returns (uint256) {
        // Get minipool queue capacity
        RocketMinipoolQueueInterface rocketMinipoolQueue = RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue"));
        uint256 minipoolCapacity = rocketMinipoolQueue.getEffectiveCapacity();
        uint256 balance = getBalance();
        // Calculate and return
        if (minipoolCapacity >= balance) { return 0; }
        else { return balance - minipoolCapacity; }
    }

    /// @dev Callback required to receive ETH withdrawal from the vault
    function receiveVaultWithdrawalETH() override external payable onlyThisLatestContract onlyLatestContract("rocketVault", msg.sender) {}

    /// @notice Deposits ETH into Rocket Pool and mints the corresponding amount of rETH to the caller
    function deposit() override external payable onlyThisLatestContract {
        // Check deposit settings
        RocketDAOProtocolSettingsDepositInterface rocketDAOProtocolSettingsDeposit = RocketDAOProtocolSettingsDepositInterface(getContractAddress("rocketDAOProtocolSettingsDeposit"));
        require(rocketDAOProtocolSettingsDeposit.getDepositEnabled(), "Deposits into Rocket Pool are currently disabled");
        require(msg.value >= rocketDAOProtocolSettingsDeposit.getMinimumDeposit(), "The deposited amount is less than the minimum deposit size");
        /*
            Check if deposit exceeds limit based on current deposit size and minipool queue capacity.

            The deposit pool can, at most, accept a deposit that, after assignments, matches ETH to every minipool in
            the queue and leaves the deposit pool with maximumDepositPoolSize ETH.

            capacityNeeded = depositPoolBalance + msg.value
            maxCapacity = maximumDepositPoolSize + queueEffectiveCapacity
            assert(capacityNeeded <= maxCapacity)
        */
        uint256 capacityNeeded = getBalance() + msg.value;
        uint256 maxDepositPoolSize = rocketDAOProtocolSettingsDeposit.getMaximumDepositPoolSize();
        if (capacityNeeded > maxDepositPoolSize) {
            // Doing a conditional require() instead of a single one optimises for the common
            // case where capacityNeeded fits in the deposit pool without looking at the queue
            if (rocketDAOProtocolSettingsDeposit.getAssignDepositsEnabled()) {
                RocketMinipoolQueueInterface rocketMinipoolQueue = RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue"));
                require(capacityNeeded <= maxDepositPoolSize + rocketMinipoolQueue.getEffectiveCapacity(),
                    "The deposit pool size after depositing (and matching with minipools) exceeds the maximum size");
            } else {
                revert("The deposit pool size after depositing exceeds the maximum size");
            }
        }
        // Calculate deposit fee
        uint256 depositFee = msg.value * rocketDAOProtocolSettingsDeposit.getDepositFee() / calcBase;
        uint256 depositNet = msg.value - depositFee;
        // Mint rETH to user account
        rocketTokenRETH.mint(depositNet, msg.sender);
        // Emit deposit received event
        emit DepositReceived(msg.sender, msg.value, block.timestamp);
        // Process deposit
        processDeposit(rocketDAOProtocolSettingsDeposit);
    }

    /// @notice Returns the maximum amount that can be accepted into the deposit pool at this time in wei
    function getMaximumDepositAmount() override external view returns (uint256) {
        RocketDAOProtocolSettingsDepositInterface rocketDAOProtocolSettingsDeposit = RocketDAOProtocolSettingsDepositInterface(getContractAddress("rocketDAOProtocolSettingsDeposit"));
        // If deposits are enabled max deposit is 0
        if (!rocketDAOProtocolSettingsDeposit.getDepositEnabled()) {
            return 0;
        }
        uint256 depositPoolBalance = getBalance();
        uint256 maxCapacity = rocketDAOProtocolSettingsDeposit.getMaximumDepositPoolSize();
        // When assignments are enabled, we can accept the max amount plus whatever space is available in the minipool queue
        if (rocketDAOProtocolSettingsDeposit.getAssignDepositsEnabled()) {
            RocketMinipoolQueueInterface rocketMinipoolQueue = RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue"));
            maxCapacity = maxCapacity + rocketMinipoolQueue.getEffectiveCapacity();
        }
        // Check we aren't already over
        if (depositPoolBalance >= maxCapacity) {
            return 0;
        }
        return maxCapacity - depositPoolBalance;
    }

    /// @dev Accepts ETH deposit from the node deposit contract (does not mint rETH)
    /// @param _totalAmount The total node deposit amount including any credit balance used
    function nodeDeposit(uint256 _totalAmount) override external payable onlyThisLatestContract onlyLatestContract("rocketNodeDeposit", msg.sender) {
        // Deposit ETH into the vault
        if (msg.value > 0) {
            rocketVault.depositEther{value: msg.value}();
        }
        // Increase recorded node balance
        addUint("deposit.pool.node.balance", _totalAmount);
    }

    /// @dev Withdraws ETH from the deposit pool to RocketNodeDeposit contract to be used for a new minipool
    /// @param _amount The amount of ETH to withdraw
    function nodeCreditWithdrawal(uint256 _amount) override external onlyThisLatestContract onlyLatestContract("rocketNodeDeposit", msg.sender) {
        // Withdraw ETH from the vault
        rocketVault.withdrawEther(_amount);
        // Send it to msg.sender (function modifier verifies msg.sender is RocketNodeDeposit)
        (bool success, ) = address(msg.sender).call{value: _amount}("");
        require(success, "Failed to send ETH");
    }

    /// @dev Recycle a deposit from a dissolved minipool
    function recycleDissolvedDeposit() override external payable onlyThisLatestContract onlyRegisteredMinipoolOrMegapool(msg.sender) {
        // Load contracts
        RocketDAOProtocolSettingsDepositInterface rocketDAOProtocolSettingsDeposit = RocketDAOProtocolSettingsDepositInterface(getContractAddress("rocketDAOProtocolSettingsDeposit"));
        // Recycle ETH
        emit DepositRecycled(msg.sender, msg.value, block.timestamp);
        processDeposit(rocketDAOProtocolSettingsDeposit);
    }

    /// @dev Recycle excess ETH from the rETH token contract
    function recycleExcessCollateral() override external payable onlyThisLatestContract onlyLatestContract("rocketTokenRETH", msg.sender) {
        // Load contracts
        RocketDAOProtocolSettingsDepositInterface rocketDAOProtocolSettingsDeposit = RocketDAOProtocolSettingsDepositInterface(getContractAddress("rocketDAOProtocolSettingsDeposit"));
        // Recycle ETH
        emit DepositRecycled(msg.sender, msg.value, block.timestamp);
        processDeposit(rocketDAOProtocolSettingsDeposit);
    }

    /// @dev Recycle a liquidated RPL stake from a slashed minipool
    function recycleLiquidatedStake() override external payable onlyThisLatestContract onlyLatestContract("rocketAuctionManager", msg.sender) {
        // Load contracts
        RocketDAOProtocolSettingsDepositInterface rocketDAOProtocolSettingsDeposit = RocketDAOProtocolSettingsDepositInterface(getContractAddress("rocketDAOProtocolSettingsDeposit"));
        // Recycle ETH
        emit DepositRecycled(msg.sender, msg.value, block.timestamp);
        processDeposit(rocketDAOProtocolSettingsDeposit);
    }

    /// @dev Process a deposit
    function processDeposit(RocketDAOProtocolSettingsDepositInterface _rocketDAOProtocolSettingsDeposit) private {
        // Transfer ETH to vault
        rocketVault.depositEther{value: msg.value}();
        // Assign deposits if enabled
        _assignDeposits(_rocketDAOProtocolSettingsDeposit);
    }

    /// @notice Assign deposits to available minipools. Reverts if assigning deposits is disabled.
    function assignDeposits() override external onlyThisLatestContract {
        // Load contracts
        RocketDAOProtocolSettingsDepositInterface rocketDAOProtocolSettingsDeposit = RocketDAOProtocolSettingsDepositInterface(getContractAddress("rocketDAOProtocolSettingsDeposit"));
        // Revert if assigning is disabled
        require(_assignDeposits(rocketDAOProtocolSettingsDeposit), "Deposit assignments are currently disabled");
    }

    /// @dev Assign deposits to available minipools. Does nothing if assigning deposits is disabled.
    function maybeAssignDeposits() override external onlyThisLatestContract returns (bool) {
        // Load contracts
        RocketDAOProtocolSettingsDepositInterface rocketDAOProtocolSettingsDeposit = RocketDAOProtocolSettingsDepositInterface(getContractAddress("rocketDAOProtocolSettingsDeposit"));
        // Revert if assigning is disabled
        return _assignDeposits(rocketDAOProtocolSettingsDeposit);
    }

    /// @dev Assigns deposits to available minipools, returns false if assignment is currently disabled
    function _assignDeposits(RocketDAOProtocolSettingsDepositInterface _rocketDAOProtocolSettingsDeposit) private returns (bool) {
        // Check if assigning deposits is enabled
        if (!_rocketDAOProtocolSettingsDeposit.getAssignDepositsEnabled()) {
            return false;
        }
        // Continue processing legacy minipool queue until empty
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        if (addressQueueStorage.getLength(queueKeyVariable) > 0) {
            RocketMinipoolQueueInterface rocketMinipoolQueue = RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue"));
            return _assignDepositsLegacy(rocketMinipoolQueue, _rocketDAOProtocolSettingsDeposit);
        }
        // Assign megapools
        assignMegapools(msg.value / 32 ether);
        return true;
    }

    /// @dev Assigns deposits using the legacy minipool queue
    function _assignDepositsLegacy(RocketMinipoolQueueInterface _rocketMinipoolQueue, RocketDAOProtocolSettingsDepositInterface _rocketDAOProtocolSettingsDeposit) private returns (bool) {
        // Load contracts
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        // Calculate the number of minipools to assign
        uint256 maxAssignments = _rocketDAOProtocolSettingsDeposit.getMaximumDepositAssignments();
        uint256 variableDepositAmount = rocketDAOProtocolSettingsMinipool.getVariableDepositAmount();
        uint256 scalingCount = msg.value / variableDepositAmount;
        uint256 totalEthCount = getBalance() / variableDepositAmount;
        uint256 assignments = _rocketDAOProtocolSettingsDeposit.getMaximumDepositSocialisedAssignments() + scalingCount;
        if (assignments > totalEthCount) {
            assignments = totalEthCount;
        }
        if (assignments > maxAssignments) {
            assignments = maxAssignments;
        }
        address[] memory minipools = _rocketMinipoolQueue.dequeueMinipools(assignments);
        if (minipools.length > 0){
            // Withdraw ETH from vault
            uint256 totalEther = minipools.length / variableDepositAmount;
            rocketVault.withdrawEther(totalEther);
            uint256 nodeBalanceUsed = 0;
            // Loop over minipools and deposit the amount required to reach launch balance
            for (uint256 i = 0; i < minipools.length; ++i) {
                RocketMinipoolInterface minipool = RocketMinipoolInterface(minipools[i]);
                // Assign deposit to minipool
                minipool.deposit{value: variableDepositAmount}();
                nodeBalanceUsed = nodeBalanceUsed + minipool.getNodeTopUpValue();
                // Emit deposit assigned event
                emit DepositAssigned(minipools[i], variableDepositAmount, block.timestamp);
            }
            // Decrease node balance
            subUint("deposit.pool.node.balance", nodeBalanceUsed);
        }
        return true;
    }

    /// @dev Withdraw excess deposit pool balance for rETH collateral
    /// @param _amount The amount of excess ETH to withdraw
    function withdrawExcessBalance(uint256 _amount) override external onlyThisLatestContract onlyLatestContract("rocketTokenRETH", msg.sender) {
        // Check amount
        require(_amount <= getExcessBalance(), "Insufficient excess balance for withdrawal");
        // Withdraw ETH from vault
        rocketVault.withdrawEther(_amount);
        // Transfer to rETH contract
        rocketTokenRETH.depositExcess{value: _amount}();
        // Emit excess withdrawn event
        emit ExcessWithdrawn(msg.sender, _amount, block.timestamp);
    }

    /// @notice Requests funds from the deposit queue by a megapool, places the request in the relevant queue
    /// @param _validatorId The megapool-managed ID of the validator requesting funds
    /// @param _amount The amount of ETH requested by the node operator
    /// @param _expressQueue Whether to consume an express ticket to be placed in the express queue
    function requestFunds(uint256 _bondAmount, uint256 _validatorId, uint256 _amount, bool _expressQueue) external payable onlyRegisteredMegapool(msg.sender) {
        // Validate arguments
        require(_bondAmount % milliToWei == 0, "Invalid supplied amount");
        require(_amount % milliToWei == 0, "Invalid requested amount");
        // Use an express ticket if requested
        address nodeAddress = RocketMegapoolInterface(msg.sender).getNodeAddress();
        if (_expressQueue) {
            RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
            rocketNodeManager.useExpressTicket(nodeAddress);
        }
        // Enqueue megapool
        bytes32 namespace = getQueueNamespace(_expressQueue);
        DepositQueueValue memory value = DepositQueueValue({
            receiver: msg.sender, 			                 // Megapool address
            validatorId: uint32(_validatorId),               // Incrementing id per validator in a megapool
            suppliedValue: uint32(_bondAmount / milliToWei),   // NO bond amount
            requestedValue: uint32(_amount / milliToWei)     // Amount being requested
        });
        LinkedListStorageInterface linkedListStorage = LinkedListStorageInterface(getContractAddress("linkedListStorage"));
        linkedListStorage.enqueueItem(namespace, value);
    }

    function exitQueue(uint256 _validatorId, bool _expressQueue) external onlyRegisteredMegapool(msg.sender) {
        LinkedListStorageInterface linkedListStorage = LinkedListStorageInterface(getContractAddress("linkedListStorage"));
        DepositQueueValue memory key = DepositQueueValue({
            receiver: msg.sender,
            validatorId: uint32(_validatorId),
            suppliedValue: 0,
            requestedValue: 0
        });
        bytes32 namespace = getQueueNamespace(_expressQueue);
        linkedListStorage.removeItem(namespace, key);
    }

    /// @notice Assigns funds to megapools at the front of the queue if enough ETH is available
    /// @param _count The maximum number of megapools to assign in this call
    function assignMegapools(uint256 _count) override public {
        if (_count == 0) {
            // Nothing to do
            return;
        }
        LinkedListStorageInterface linkedListStorage = LinkedListStorageInterface(getContractAddress("linkedListStorage"));
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));

        uint256 expressQueueLength = linkedListStorage.getLength(expressQueueNamespace);
        uint256 standardQueueLength = linkedListStorage.getLength(standardQueueNamespace);

        uint256 queueIndex = getUint("megapool.queue.index");
        uint256 nodeBalanceUsed = 0;

        // TODO: Parameterise express_queue_rate
        uint256 expressQueueRate = 2;

        for (uint256 i = 0; i < _count; i++) {
            if (expressQueueLength == 0 && standardQueueLength == 0) {
                break;
            }

            bool express = queueIndex % (expressQueueRate+1) != 0;

            if (express && expressQueueLength == 0) {
                express = false;
            }

            if (!express && standardQueueLength == 0) {
                express = true;
            }

            bytes32 namespace = getQueueNamespace(express);
            DepositQueueValue memory head = linkedListStorage.peekItem(namespace);
            uint256 ethRequired = head.requestedValue * milliToWei;

            if (rocketVault.balanceOf("rocketDepositPool") < ethRequired) {
                // Not enough ETH to service next in line
                break;
            }

            rocketVault.withdrawEther(ethRequired);

            // Assign funds and dequeue megapool
            RocketMegapoolInterface(head.receiver).assignFunds{value: ethRequired}(head.validatorId);
            linkedListStorage.dequeueItem(namespace);

            // Account for node balance
            nodeBalanceUsed += head.suppliedValue;

            // Update counts for next iteration
            queueIndex ++;
            if (express) {
                expressQueueLength -= 1;
            } else {
                standardQueueLength -= 1;
            }
        }

        // Store state changes
        subUint("deposit.pool.node.balance", nodeBalanceUsed);
        setUint("megapool.queue.index", queueIndex);
    }

    /// @notice 
    function getQueueNamespace(bool _expressQueue) internal pure returns (bytes32) {
        if (_expressQueue) {
            return expressQueueNamespace;
        }
        return standardQueueNamespace;
    }
}
