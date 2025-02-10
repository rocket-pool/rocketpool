// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

import "../../interface/util/LinkedListStorageInterface.sol";
import {AddressQueueStorageInterface} from "../../interface/util/AddressQueueStorageInterface.sol";
import {LinkedListStorageInterface} from "../../interface/util/LinkedListStorageInterface.sol";
import {RocketBase} from "../RocketBase.sol";
import {RocketDAOProtocolSettingsDepositInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsDepositInterface.sol";
import {RocketDAOProtocolSettingsMinipoolInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import {RocketDepositPoolInterface} from "../../interface/deposit/RocketDepositPoolInterface.sol";
import {RocketMegapoolDelegateInterface} from "../../interface/megapool/RocketMegapoolDelegateInterface.sol";
import {RocketMegapoolInterface} from "../../interface/megapool/RocketMegapoolInterface.sol";
import {RocketMinipoolInterface} from "../../interface/minipool/RocketMinipoolInterface.sol";
import {RocketMinipoolQueueInterface} from "../../interface/minipool/RocketMinipoolQueueInterface.sol";
import {RocketNodeManagerInterface} from "../../interface/node/RocketNodeManagerInterface.sol";
import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketTokenRETHInterface} from "../../interface/token/RocketTokenRETHInterface.sol";
import {RocketVaultInterface} from "../../interface/RocketVaultInterface.sol";
import {RocketVaultWithdrawerInterface} from "../../interface/RocketVaultWithdrawerInterface.sol";

/// @notice Accepts user deposits and mints rETH; handles assignment of deposited ETH to megapools
contract RocketDepositPool is RocketBase, RocketDepositPoolInterface, RocketVaultWithdrawerInterface {

    // Constants
    uint256 internal constant milliToWei = 10 ** 15;
    bytes32 internal constant queueKeyVariable = keccak256("minipools.available.variable");
    bytes32 internal constant expressQueueNamespace = keccak256("deposit.queue.express");
    bytes32 internal constant standardQueueNamespace = keccak256("deposit.queue.standard");

    // Immutables
    RocketVaultInterface immutable internal rocketVault;
    RocketTokenRETHInterface immutable internal rocketTokenRETH;

    // Events
    event DepositReceived(address indexed from, uint256 amount, uint256 time);
    event DepositRecycled(address indexed from, uint256 amount, uint256 time);
    event DepositAssigned(address indexed minipool, uint256 amount, uint256 time);
    event ExcessWithdrawn(address indexed to, uint256 amount, uint256 time);
    event FundsRequested(address indexed receiver, uint256 validatorId, uint256 amount, bool expressQueue, uint256 time);
    event FundsAssigned(address indexed receiver, uint256 amount, uint256 time);
    event QueueExited(address indexed receiver, uint256 time);
    event CreditWithdrawn(address indexed receiver, uint256 amount, uint256 time);

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
        version = 4;
        // Pre-retrieve non-upgradable contract addresses to save gas
        rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        rocketTokenRETH = RocketTokenRETHInterface(getContractAddress("rocketTokenRETH"));
    }

    /// @notice Returns the current deposit pool balance
    function getBalance() override public view returns (uint256) {
        return rocketVault.balanceOf("rocketDepositPool");
    }

    /// @notice Returns the amount of ETH contributed to the deposit pool by node operators waiting in the queue
    function getNodeBalance() override public view returns (uint256) {
        return getUint("deposit.pool.node.balance");
    }

    /// @notice Returns the user owned portion of the deposit pool
    /// @dev Negative indicates more ETH has been "lent" to the deposit pool by node operators in the queue
    ///      than is available from user deposits
    function getUserBalance() override public view returns (int256) {
        return int256(getBalance()) - int256(getNodeBalance());
    }

    /// @notice Returns the credit balance for a given node operator
    /// @param _nodeAddress Address of the node operator to query
    function getNodeCreditBalance(address _nodeAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("node.deposit.credit.balance", _nodeAddress)));
    }

    /// @notice Excess deposit pool balance (in excess of minipool queue capacity)
    function getExcessBalance() override public view returns (uint256) {
        // Get minipool queue capacity
        RocketMinipoolQueueInterface rocketMinipoolQueue = RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue"));
        uint256 minipoolCapacity = rocketMinipoolQueue.getEffectiveCapacity();
        uint256 balance = getBalance();
        // Calculate and return
        if (minipoolCapacity >= balance) {return 0;}
        else {return balance - minipoolCapacity;}
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
                uint256 capacity = rocketMinipoolQueue.getEffectiveCapacity();
                capacity += getUint(keccak256("deposit.pool.requested.total"));
                require(capacityNeeded <= maxDepositPoolSize + capacity, "The deposit pool size after depositing exceeds the maximum size");
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
            maxCapacity += rocketMinipoolQueue.getEffectiveCapacity();
            maxCapacity += getUint(keccak256("deposit.pool.requested.total"));
        }
        // Check we aren't already over
        if (depositPoolBalance >= maxCapacity) {
            return 0;
        }
        return maxCapacity - depositPoolBalance;
    }

    /// @notice Accepts ETH deposit from the node deposit contract (does not mint rETH)
    /// @param _bondAmount The total node deposit amount including any credit balance used
    function nodeDeposit(uint256 _bondAmount) override external payable onlyThisLatestContract onlyLatestContract("rocketNodeDeposit", msg.sender) {
        // Deposit ETH into the vault
        if (msg.value > 0) {
            rocketVault.depositEther{value: msg.value}();
        }
        // Increase recorded node balance
        addUint("deposit.pool.node.balance", _bondAmount);
    }

    /// @notice Recycle a deposit from a dissolved validator
    function recycleDissolvedDeposit() override external payable onlyThisLatestContract onlyRegisteredMinipoolOrMegapool(msg.sender) {
        _recycleValue();
    }

    /// @notice Recycle excess ETH from the rETH token contract
    function recycleExcessCollateral() override external payable onlyThisLatestContract onlyLatestContract("rocketTokenRETH", msg.sender) {
        _recycleValue();
    }

    /// @notice Recycle a liquidated RPL stake from a slashed minipool
    function recycleLiquidatedStake() override external payable onlyThisLatestContract onlyLatestContract("rocketAuctionManager", msg.sender) {
        _recycleValue();
    }

    /// @dev Recycles msg.value into the deposit pool
    function _recycleValue() internal {
        // Load contracts
        RocketDAOProtocolSettingsDepositInterface rocketDAOProtocolSettingsDeposit = RocketDAOProtocolSettingsDepositInterface(getContractAddress("rocketDAOProtocolSettingsDeposit"));
        // Recycle ETH
        emit DepositRecycled(msg.sender, msg.value, block.timestamp);
        processDeposit(rocketDAOProtocolSettingsDeposit);
    }

    /// @dev Deposits incoming funds into vault and performs assignment
    function processDeposit(RocketDAOProtocolSettingsDepositInterface _rocketDAOProtocolSettingsDeposit) internal {
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

    /// @notice Assign deposits to available minipools. Does nothing if assigning deposits is disabled.
    function maybeAssignDeposits() override external onlyThisLatestContract returns (bool) {
        // Load contracts
        RocketDAOProtocolSettingsDepositInterface rocketDAOProtocolSettingsDeposit = RocketDAOProtocolSettingsDepositInterface(getContractAddress("rocketDAOProtocolSettingsDeposit"));
        // Revert if assigning is disabled
        return _assignDeposits(rocketDAOProtocolSettingsDeposit);
    }

    /// @notice If deposit assignments are enabled, assigns a single deposit
    function maybeAssignOneDeposit() override external onlyThisLatestContract {
        RocketDAOProtocolSettingsDepositInterface rocketDAOProtocolSettingsDeposit = RocketDAOProtocolSettingsDepositInterface(getContractAddress("rocketDAOProtocolSettingsDeposit"));
        if (!rocketDAOProtocolSettingsDeposit.getAssignDepositsEnabled()) {
            return;
        }
        // TODO: Clarify in RPIP "If possible, deposit SHALL assign one validator as described below" if this means node deposit should assign to legacy minipools too
        _assignMegapools(1);
    }

    /// @notice Assigns funds to megapools at the front of the queue if enough ETH is available
    /// @param _count The maximum number of megapools to assign in this call
    function assignMegapools(uint256 _count) override external onlyThisLatestContract {
        RocketDAOProtocolSettingsDepositInterface rocketDAOProtocolSettingsDeposit = RocketDAOProtocolSettingsDepositInterface(getContractAddress("rocketDAOProtocolSettingsDeposit"));
        require(rocketDAOProtocolSettingsDeposit.getAssignDepositsEnabled(), "Deposit assignments are disabled");
        _assignMegapools(_count);
    }

    /// @dev Assigns deposits to available minipools, returns false if assignment is currently disabled
    function _assignDeposits(RocketDAOProtocolSettingsDepositInterface _rocketDAOProtocolSettingsDeposit) internal returns (bool) {
        // Check if assigning deposits is enabled
        if (!_rocketDAOProtocolSettingsDeposit.getAssignDepositsEnabled()) {
            return false;
        }
        // Continue processing legacy minipool queue until empty
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        if (addressQueueStorage.getLength(queueKeyVariable) > 0) {
            RocketMinipoolQueueInterface rocketMinipoolQueue = RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue"));
            _assignDepositsLegacy(rocketMinipoolQueue, _rocketDAOProtocolSettingsDeposit);
        } else {
            // Then assign megapools
            _assignDepositsNew(_rocketDAOProtocolSettingsDeposit);
        }
        return true;
    }

    /// @dev Assigns deposits using the new megapool queue
    function _assignDepositsNew(RocketDAOProtocolSettingsDepositInterface _rocketDAOProtocolSettingsDeposit) internal {
        // Calculate the number of minipools to assign
        // TODO: Confirm whether we still want to support socialised assignments or whether the RPIP intends for them to be entirely removed (improve gas if removed)
        uint256 maxAssignments = _rocketDAOProtocolSettingsDeposit.getMaximumDepositAssignments();
        uint256 scalingCount = msg.value / 32 ether;
        uint256 assignments = _rocketDAOProtocolSettingsDeposit.getMaximumDepositSocialisedAssignments() + scalingCount;
        if (assignments > maxAssignments) {
            assignments = maxAssignments;
        }
        _assignMegapools(assignments);
    }

    /// @dev Assigns deposits using the legacy minipool queue
    function _assignDepositsLegacy(RocketMinipoolQueueInterface _rocketMinipoolQueue, RocketDAOProtocolSettingsDepositInterface _rocketDAOProtocolSettingsDeposit) internal {
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
        if (minipools.length > 0) {
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
    function requestFunds(uint256 _bondAmount, uint32 _validatorId, uint256 _amount, bool _expressQueue) external onlyRegisteredMegapool(msg.sender) {
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
            receiver: msg.sender,                             // Megapool address
            validatorId: _validatorId,                // Incrementing id per validator in a megapool
            suppliedValue: uint32(_bondAmount / milliToWei),  // NO bond amount
            requestedValue: uint32(_amount / milliToWei)      // Amount being requested
        });
        LinkedListStorageInterface linkedListStorage = LinkedListStorageInterface(getContractAddress("linkedListStorage"));
        linkedListStorage.enqueueItem(namespace, value);
        // Increase requested balance and node balance
        addUint(keccak256("deposit.pool.requested.total"), _amount);
        // Check if head moved
        if (_expressQueue) {
            uint256 expressQueueLength = linkedListStorage.getLength(expressQueueNamespace);
            if (expressQueueLength == 1) {
                setUint(keccak256("megapool.express.queue.head.moved.block"), block.number);
            }
        } else {
            uint256 standardQueueLength = linkedListStorage.getLength(standardQueueNamespace);
            if (standardQueueLength == 1) {
                setUint(keccak256("megapool.standard.queue.head.moved.block"), block.number);
            }
        }
        // Emit event
        emit FundsRequested(msg.sender, _validatorId, _amount, _expressQueue, block.timestamp);
    }

    /// @notice Removes a pending entry in the validator queue and returns funds to node by credit mechanism
    /// @param _validatorId Internal ID of the validator to be removed
    /// @param _expressQueue Whether the entry is in the express queue or not
    function exitQueue(uint32 _validatorId, bool _expressQueue) external onlyRegisteredMegapool(msg.sender) {
        LinkedListStorageInterface linkedListStorage = LinkedListStorageInterface(getContractAddress("linkedListStorage"));
        DepositQueueKey memory key = DepositQueueKey({
            receiver: msg.sender,
            validatorId: _validatorId
        });
        bytes32 namespace = getQueueNamespace(_expressQueue);
        uint256 index = linkedListStorage.getIndexOf(namespace, key);
        DepositQueueValue memory value = linkedListStorage.getItem(namespace, index);
        bool isAtHead = linkedListStorage.getHeadIndex(namespace) == index;
        linkedListStorage.removeItem(namespace, key);
        // Perform balance accounting
        subUint(keccak256("deposit.pool.requested.total"), value.requestedValue * milliToWei);
        // Add to node's credit for the amount supplied
        RocketMegapoolDelegateInterface megapool = RocketMegapoolDelegateInterface(msg.sender);
        address nodeAddress = megapool.getNodeAddress();
        addUint(keccak256(abi.encodePacked("node.deposit.credit.balance", nodeAddress)), value.suppliedValue * milliToWei);
        if (_expressQueue) {
            // Refund express ticket
            RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
            rocketNodeManager.refundExpressTicket(nodeAddress);
            // Update head moved block
            if (isAtHead) {
                setUint(keccak256("megapool.express.queue.head.moved.block"), block.number);
            }
        } else {
            // Update head moved block
            if (isAtHead) {
                setUint(keccak256("megapool.standard.queue.head.moved.block"), block.number);
            }
        }
        // Emit event
        emit QueueExited(msg.sender, block.timestamp);
    }

    /// @notice Allows node operator to withdraw any ETH credit they have as rETH
    /// @param _amount Amount in ETH to withdraw
    function withdrawCredit(uint256 _amount) override external onlyRegisteredNode(msg.sender) {
        uint256 credit = getUint(keccak256(abi.encodePacked("node.deposit.credit.balance", msg.sender)));
        require(credit >= _amount, "Amount exceeds credit available");
        // Account for balance changes
        subUint(keccak256(abi.encodePacked("node.deposit.credit.balance", msg.sender)), _amount);
        subUint("deposit.pool.node.balance", _amount);
        // Mint rETH to node
        // TODO: Do we need to check deposits are enabled, capacity is respected and apply a deposit fee?
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        rocketTokenRETH.mint(_amount, rocketNodeManager.getNodeWithdrawalAddress(msg.sender));
        // The funds are already stored in RocketVault under RocketDepositPool so no transfer is required
        // Emit event
        emit CreditWithdrawn(msg.sender, _amount, block.timestamp);
    }

    /// @notice Gets the receiver next to be assigned and whether it can be assigned immediately
    /// @dev During the transition period from the legacy minipool queue, this will always return null address
    /// @return receiver Address of the receiver of the next assignment or null address for an empty queue
    /// @return assignmentPossible Whether there is enough funds in the pool to perform an assignment now
    /// @return headMovedBlock The block at which the receiver entered the top of the queue
    function getQueueTop() override external view returns (address, bool, uint256) {
        // If legacy queue is still being processed, return null address
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        if (addressQueueStorage.getLength(queueKeyVariable) > 0) {
            return (address(0x0), false, 0);
        }

        // Get contracts
        LinkedListStorageInterface linkedListStorage = LinkedListStorageInterface(getContractAddress("linkedListStorage"));
        RocketDAOProtocolSettingsDepositInterface rocketDAOProtocolSettingsDeposit = RocketDAOProtocolSettingsDepositInterface(getContractAddress("rocketDAOProtocolSettingsDeposit"));

        uint256 expressQueueLength = linkedListStorage.getLength(expressQueueNamespace);
        uint256 standardQueueLength = linkedListStorage.getLength(standardQueueNamespace);

        // If both queues are empty, return null address
        if (expressQueueLength == 0 && standardQueueLength == 0) {
            return (address(0x0), false, 0);
        }

        uint256 queueIndex = getUint(keccak256("megapool.queue.index"));

        uint256 expressQueueRate = rocketDAOProtocolSettingsDeposit.getExpressQueueRate();

        bool express = queueIndex % (expressQueueRate + 1) != 0;
        if (express && expressQueueLength == 0) {
            express = false;
        }

        if (!express && standardQueueLength == 0) {
            express = true;
        }

        // Check if enough value is in the deposit pool to assign the requested value
        bytes32 namespace = getQueueNamespace(express);
        DepositQueueValue memory head = linkedListStorage.peekItem(namespace);
        bool assignmentPossible = rocketVault.balanceOf("rocketDepositPool") >= head.requestedValue;

        // Check assignments are enabled
        if (!rocketDAOProtocolSettingsDeposit.getAssignDepositsEnabled()) {
            assignmentPossible = false;
        }

        // Retrieve the block at which the entry at the top of the queue got to that position
        uint256 headMovedBlock;
        if (express) {
            headMovedBlock = getUint(keccak256("megapool.express.queue.head.moved.block"));
        } else {
            headMovedBlock = getUint(keccak256("megapool.standard.queue.head.moved.block"));
        }

        return (head.receiver, assignmentPossible, headMovedBlock);
    }

    /// @dev Loops over a maximum of `_count` entries in the queue and assigns funds
    /// @param _count Maximum number of entries to assign
    function _assignMegapools(uint256 _count) internal {
        if (_count == 0) {
            // Nothing to do
            return;
        }
        LinkedListStorageInterface linkedListStorage = LinkedListStorageInterface(getContractAddress("linkedListStorage"));

        uint256 expressQueueLength = linkedListStorage.getLength(expressQueueNamespace);
        uint256 standardQueueLength = linkedListStorage.getLength(standardQueueNamespace);

        uint256 queueIndex = getUint(keccak256("megapool.queue.index"));
        uint256 nodeBalanceUsed = 0;

        RocketDAOProtocolSettingsDepositInterface rocketDAOProtocolSettingsDeposit = RocketDAOProtocolSettingsDepositInterface(getContractAddress("rocketDAOProtocolSettingsDeposit"));
        uint256 expressQueueRate = rocketDAOProtocolSettingsDeposit.getExpressQueueRate();
        uint256 totalSent = 0;

        bool expressHeadMoved = false;
        bool standardHeadMoved = false;

        for (uint256 i = 0; i < _count; i++) {
            if (expressQueueLength == 0 && standardQueueLength == 0) {
                break;
            }

            bool express = queueIndex % (expressQueueRate + 1) != expressQueueRate;

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
            emit FundsAssigned(head.receiver, ethRequired, block.timestamp);
            linkedListStorage.dequeueItem(namespace);

            // Account for node balance
            nodeBalanceUsed += head.suppliedValue;
            totalSent += ethRequired;

            // Update counts for next iteration
            queueIndex ++;
            if (express) {
                expressQueueLength -= 1;
                expressHeadMoved = true;
            } else {
                standardQueueLength -= 1;
                standardHeadMoved = true;
            }
        }

        // Store state changes
        subUint("deposit.pool.node.balance", nodeBalanceUsed);
        setUint(keccak256("megapool.queue.index"), queueIndex);
        subUint(keccak256("deposit.pool.requested.total"), totalSent);
        setUint(keccak256("megapool.queue.last.moved.block"), block.number);

        // Update head moved blocks
        if (expressHeadMoved) {
            setUint(keccak256("megapool.express.queue.head.moved.block"), block.number);
        }
        if (standardHeadMoved) {
            setUint(keccak256("megapool.standard.queue.head.moved.block"), block.number);
        }
    }

    /// @notice Retrieves the queue index (used for deciding whether to assign express or standard queue next)
    function getQueueIndex() override external view returns (uint256) {
        return getUint(keccak256("megapool.queue.index"));
    }

    /// @dev Convenience method to return queue key for express and non-express queues
    function getQueueNamespace(bool _expressQueue) internal pure returns (bytes32) {
        if (_expressQueue) {
            return expressQueueNamespace;
        }
        return standardQueueNamespace;
    }
}
