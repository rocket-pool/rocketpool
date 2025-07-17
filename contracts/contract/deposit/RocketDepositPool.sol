// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketNetworkBalancesInterface} from "../../interface/network/RocketNetworkBalancesInterface.sol";
import {AddressQueueStorageInterface} from "../../interface/util/AddressQueueStorageInterface.sol";
import {LinkedListStorageInterface} from "../../interface/util/LinkedListStorageInterface.sol";
import {RocketBase} from "../RocketBase.sol";
import {RocketDAOProtocolSettingsDepositInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsDepositInterface.sol";
import {RocketDAOProtocolSettingsMinipoolInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import {RocketDAOProtocolSettingsNetworkInterface} from "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";
import {RocketDepositPoolInterface} from "../../interface/deposit/RocketDepositPoolInterface.sol";
import {RocketMegapoolDelegateInterface} from "../../interface/megapool/RocketMegapoolDelegateInterface.sol";
import {RocketMegapoolInterface} from "../../interface/megapool/RocketMegapoolInterface.sol";
import {RocketMinipoolInterface} from "../../interface/minipool/RocketMinipoolInterface.sol";
import {RocketMinipoolQueueInterface} from "../../interface/minipool/RocketMinipoolQueueInterface.sol";
import {RocketNetworkSnapshotsInterface} from "../../interface/network/RocketNetworkSnapshotsInterface.sol";
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
    bytes32 internal constant queueMovedKey = keccak256("megapool.queue.moved");
    bytes32 internal constant nodeBalanceKey = "deposit.pool.node.balance"; // Note: this is not hashed due to bug in earlier contract
    bytes32 internal constant requestedTotalKey = keccak256("deposit.pool.requested.total");
    bytes32 internal constant queueIndexKey = keccak256("megapool.queue.index");

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
    event QueueExited(address indexed nodeAddress, uint256 time);
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
        return getUint(nodeBalanceKey);
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

    /// @notice Excess deposit pool balance (in excess of validator queue)
    function getExcessBalance() override public view returns (uint256) {
        // Get minipool queue capacity
        RocketMinipoolQueueInterface rocketMinipoolQueue = RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue"));
        uint256 capacity = rocketMinipoolQueue.getEffectiveCapacity();
        capacity += getUint(requestedTotalKey);
        uint256 balance = getBalance();
        // Calculate and return
        if (capacity >= balance) {
            return 0;
        } else {
            return balance - capacity;
        }
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
        uint256 capacityNeeded;
        unchecked { // Infeasible overflow
            capacityNeeded = getBalance() + msg.value;
        }
        uint256 maxDepositPoolSize = rocketDAOProtocolSettingsDeposit.getMaximumDepositPoolSize();
        if (capacityNeeded > maxDepositPoolSize) {
            // Doing a conditional require() instead of a single one optimises for the common
            // case where capacityNeeded fits in the deposit pool without looking at the queue
            if (rocketDAOProtocolSettingsDeposit.getAssignDepositsEnabled()) {
                RocketMinipoolQueueInterface rocketMinipoolQueue = RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue"));
                uint256 capacity = rocketMinipoolQueue.getEffectiveCapacity();
                capacity += getUint(requestedTotalKey);
                require(capacityNeeded <= maxDepositPoolSize + capacity, "The deposit pool size after depositing exceeds the maximum size");
            } else {
                revert("The deposit pool size after depositing exceeds the maximum size");
            }
        }
        // Calculate deposit fee
        unchecked { // depositFee < msg.value
            uint256 depositFee = msg.value * rocketDAOProtocolSettingsDeposit.getDepositFee() / calcBase;
            uint256 depositNet = msg.value - depositFee;
            // Mint rETH to user account
            rocketTokenRETH.mint(depositNet, msg.sender);
        }
        // Emit deposit received event
        emit DepositReceived(msg.sender, msg.value, block.timestamp);
        // Process deposit
        processDeposit();
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
            maxCapacity += getUint(requestedTotalKey);
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
        // Note: The difference between `_bondAmount` and `msg.value` is the amount of credit being used on this deposit.
        //       That amount of credit is already accounted for in `deposit.pool.node.balance` and therefore we only
        //       need to add `msg.value` to the node balance.
        addUint(nodeBalanceKey, msg.value);
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
        // Recycle ETH
        emit DepositRecycled(msg.sender, msg.value, block.timestamp);
        processDeposit();
    }

    /// @dev Deposits incoming funds into rETH buffer and excess into vault then performs assignment
    function processDeposit() internal {
        // Direct deposit ETH to rETH until target collateral is reached
        uint256 toReth = getRethCollateralShortfall();
        if (toReth > msg.value) {
            toReth = msg.value;
        }
        uint256 toVault = msg.value - toReth;
        if (toReth > 0) {
            rocketTokenRETH.depositExcess{value: toReth}();
        }
        if (toVault > 0) {
            rocketVault.depositEther{value: toVault}();
        }
        // Assign deposits if enabled
        _assignByDeposit();
    }

    /// @dev Returns the shortfall in ETH from the target collateral rate of rETH
    function getRethCollateralShortfall() internal returns (uint256) {
        // Load contracts
        RocketDAOProtocolSettingsNetworkInterface rocketDAOProtocolSettingsNetwork = RocketDAOProtocolSettingsNetworkInterface(getContractAddress("rocketDAOProtocolSettingsNetwork"));
        RocketNetworkBalancesInterface rocketNetworkBalances = RocketNetworkBalancesInterface(getContractAddress("rocketNetworkBalances"));
        // Calculate target collateral
        uint256 targetCollateralRate = rocketDAOProtocolSettingsNetwork.getTargetRethCollateralRate();
        uint256 rocketTokenRETHBalance = address(rocketTokenRETH).balance;
        uint256 totalCollateral = rocketNetworkBalances.getTotalETHBalance();
        uint256 targetCollateral = totalCollateral * targetCollateralRate / calcBase;
        // Calculate shortfall
        if (targetCollateral > rocketTokenRETHBalance) {
            return targetCollateral - rocketTokenRETHBalance;
        }
        return 0;
    }

    /// @notice If deposit assignments are enabled, assigns up to specified number of minipools/megapools
    /// @param _max Maximum number of minipools/megapools to assign
    function maybeAssignDeposits(uint256 _max) override external onlyThisLatestContract {
        require(_max > 0, "Must assign at least 1");
        RocketDAOProtocolSettingsDepositInterface rocketDAOProtocolSettingsDeposit = RocketDAOProtocolSettingsDepositInterface(getContractAddress("rocketDAOProtocolSettingsDeposit"));
        if (!rocketDAOProtocolSettingsDeposit.getAssignDepositsEnabled()) {
            return;
        }
        _assignDeposits(_max, rocketDAOProtocolSettingsDeposit);
    }

    /// @notice Assigns up to specified number of minipools or megapools, reverts if assignments are disabled
    /// @param _max Maximum number of minipools/megapools to assign
    function assignDeposits(uint256 _max) override external onlyThisLatestContract {
        require(_max > 0, "Must assign at least 1");
        RocketDAOProtocolSettingsDepositInterface rocketDAOProtocolSettingsDeposit = RocketDAOProtocolSettingsDepositInterface(getContractAddress("rocketDAOProtocolSettingsDeposit"));
        require(rocketDAOProtocolSettingsDeposit.getAssignDepositsEnabled(), "Deposit assignments are disabled");
        _assignDeposits(_max, rocketDAOProtocolSettingsDeposit);
    }

    /// @dev Assigns up to specified number of minipools or megapools
    /// @param _max Maximum number of minipools/megapools to assign
    function _assignDeposits(uint256 _max, RocketDAOProtocolSettingsDepositInterface _rocketDAOProtocolSettingsDeposit) internal {
        // Get contracts
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        // Process minipool queue first
        uint256 minipoolQueueLength = addressQueueStorage.getLength(queueKeyVariable);
        if (minipoolQueueLength > 0) {
            if (minipoolQueueLength >= _max) {
                _assignMinipools(_max, _rocketDAOProtocolSettingsDeposit);
                return;
            } else {
                unchecked { // _max < minipoolQueueLength
                    _max -= minipoolQueueLength;
                }
                _assignMinipools(minipoolQueueLength, _rocketDAOProtocolSettingsDeposit);
            }
        }
        // Assign remainder to megapools
        if (_max > 0) {
            _assignMegapools(_max, _rocketDAOProtocolSettingsDeposit);
        }
    }

    /// @dev Assigns to minipools/megapools based on `msg.value`, does nothing if assignments are disabled
    function _assignByDeposit() internal {
        // Get contracts
        RocketDAOProtocolSettingsDepositInterface rocketDAOProtocolSettingsDeposit = RocketDAOProtocolSettingsDepositInterface(getContractAddress("rocketDAOProtocolSettingsDeposit"));
        // Check if assigning deposits is enabled
        if (!rocketDAOProtocolSettingsDeposit.getAssignDepositsEnabled()) {
            return;
        }
        // Continue processing legacy minipool queue until empty
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        if (addressQueueStorage.getLength(queueKeyVariable) > 0) {
            RocketMinipoolQueueInterface rocketMinipoolQueue = RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue"));
            _assignMinipoolsByDeposit(rocketMinipoolQueue, rocketDAOProtocolSettingsDeposit);
        } else {
            // Then assign megapools
            _assignMegapoolsByDeposit(rocketDAOProtocolSettingsDeposit);
        }
    }

    /// @dev Assigns a number of minipools based on `msg.value`
    function _assignMinipoolsByDeposit(RocketMinipoolQueueInterface _rocketMinipoolQueue, RocketDAOProtocolSettingsDepositInterface _rocketDAOProtocolSettingsDeposit) internal {
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
        if (assignments > 0) {
            _assignMinipools(assignments, _rocketDAOProtocolSettingsDeposit);
        }
    }

    /// @dev Assigns a number of megapools based on `msg.value`
    function _assignMegapoolsByDeposit(RocketDAOProtocolSettingsDepositInterface _rocketDAOProtocolSettingsDeposit) internal {
        // Calculate the number of megapool validators to assign
        uint256 maxAssignments = _rocketDAOProtocolSettingsDeposit.getMaximumDepositAssignments();
        uint256 scalingCount = msg.value / 32 ether;
        uint256 assignments = _rocketDAOProtocolSettingsDeposit.getMaximumDepositSocialisedAssignments() + scalingCount;
        if (assignments > maxAssignments) {
            assignments = maxAssignments;
        }
        if (assignments > 0) {
            _assignMegapools(assignments, _rocketDAOProtocolSettingsDeposit);
        }
    }

    /// @dev Assigns up to `_count` number of minipools
    /// @param _count Maximum number of entries to assign
    function _assignMinipools(uint256 _count, RocketDAOProtocolSettingsDepositInterface _rocketDAOProtocolSettingsDeposit) internal {
        // Get contracts
        RocketMinipoolQueueInterface rocketMinipoolQueue = RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue"));
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        // Calculate max possible assignments based on current balance
        uint256 variableDepositAmount = rocketDAOProtocolSettingsMinipool.getVariableDepositAmount();
        uint256 maxPossible = getBalance() / variableDepositAmount;
        if (maxPossible == 0) {
            return;
        }
        if (_count > maxPossible) {
            _count = maxPossible;
        }
        // Dequeue minipools
        address[] memory minipools = rocketMinipoolQueue.dequeueMinipools(_count);
        if (minipools.length > 0) {
            // Withdraw ETH from vault
            uint256 totalEther = minipools.length * variableDepositAmount;
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
            subUint(nodeBalanceKey, nodeBalanceUsed);
        }
    }

    /// @dev Assigns up to `_count` number of megapools
    /// @param _count Maximum number of entries to assign
    function _assignMegapools(uint256 _count, RocketDAOProtocolSettingsDepositInterface _rocketDAOProtocolSettingsDeposit) internal {
        // Get contracts
        LinkedListStorageInterface linkedListStorage = LinkedListStorageInterface(getContractAddress("linkedListStorage"));
        // Get required inputs
        uint256 expressQueueLength = linkedListStorage.getLength(expressQueueNamespace);
        uint256 standardQueueLength = linkedListStorage.getLength(standardQueueNamespace);
        uint256 queueIndex = getUint(queueIndexKey);
        uint256 expressQueueRate = _rocketDAOProtocolSettingsDeposit.getExpressQueueRate();
        // Keep track of changes to applied at the end
        uint256 nodeBalanceUsed = 0;
        uint256 totalSent = 0;
        uint256 vaultBalance = getBalance();
        // Keep track of whether heads move
        bool expressHeadMoved = false;
        bool standardHeadMoved = false;
        // Iterate over maximum of `_count` entries
        for (uint256 i = 0; i < _count; i++) {
            if (expressQueueLength == 0 && standardQueueLength == 0) {
                break;
            }
            // Determine if we are assigning an express queue entry
            bool express = queueIndex % (expressQueueRate + 1) != expressQueueRate;
            if (express && expressQueueLength == 0) {
                express = false;
            }
            if (!express && standardQueueLength == 0) {
                express = true;
            }
            // Get the entry
            bytes32 namespace = getQueueNamespace(express);
            LinkedListStorageInterface.DepositQueueValue memory head = linkedListStorage.peekItem(namespace);
            uint256 ethRequired = head.requestedValue * milliToWei;
            // Check if we have enough available to assign
            if (vaultBalance < ethRequired) {
                break;
            }
            // Withdraw the funds from the vault
            rocketVault.withdrawEther(ethRequired);
            vaultBalance -= ethRequired;
            // Assign funds and dequeue megapool
            RocketMegapoolInterface(head.receiver).assignFunds{value: ethRequired}(head.validatorId);
            emit FundsAssigned(head.receiver, ethRequired, block.timestamp);
            linkedListStorage.dequeueItem(namespace);
            // Account for node balance
            unchecked { // Infeasible overflows and impossible underflows
                nodeBalanceUsed += head.suppliedValue * milliToWei;
                totalSent += ethRequired;
            // Update counts for next iteration
                queueIndex += 1;
                if (express) {
                    expressQueueLength -= 1;
                    expressHeadMoved = true;
                } else {
                    standardQueueLength -= 1;
                    standardHeadMoved = true;
                }
            }
        }
        // Store state changes
        subUint(nodeBalanceKey, nodeBalanceUsed);
        setUint(queueIndexKey, queueIndex);
        subUint(requestedTotalKey, totalSent);
        setQueueMoved(expressHeadMoved, standardHeadMoved);
    }

    /// @dev Stores block number when the queues moved
    function setQueueMoved(bool expressHeadMoved, bool standardHeadMoved) internal {
        uint256 packed = getUint(queueMovedKey);
        uint128 express = expressHeadMoved ? uint128(block.number) : uint128(packed >> 0);
        uint128 standard = standardHeadMoved ? uint128(block.number) : uint128(packed >> 128);
        packed = express << 0;
        packed |= uint256(standard) << 128;
        setUint(queueMovedKey, packed);
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
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        if (_expressQueue) {
            rocketNodeManager.useExpressTicket(nodeAddress);
        } else {
            rocketNodeManager.provisionExpressTickets(nodeAddress);
        }
        // Enqueue megapool
        bytes32 namespace = getQueueNamespace(_expressQueue);
        LinkedListStorageInterface.DepositQueueValue memory value = LinkedListStorageInterface.DepositQueueValue({
            receiver: msg.sender,                             // Megapool address
            validatorId: _validatorId,                        // Incrementing id per validator in a megapool
            suppliedValue: uint32(_bondAmount / milliToWei),  // NO bond amount
            requestedValue: uint32(_amount / milliToWei)      // Amount being requested
        });
        LinkedListStorageInterface linkedListStorage = LinkedListStorageInterface(getContractAddress("linkedListStorage"));
        linkedListStorage.enqueueItem(namespace, value);
        // Increase requested balance and node balance
        addUint(requestedTotalKey, _amount);
        // Check if head moved
        if (_expressQueue) {
            uint256 expressQueueLength = linkedListStorage.getLength(expressQueueNamespace);
            if (expressQueueLength == 1) {
                setQueueMoved(true, false);
            }
        } else {
            uint256 standardQueueLength = linkedListStorage.getLength(standardQueueNamespace);
            if (standardQueueLength == 1) {
                setQueueMoved(false, true);
            }
        }
        {
            // Update collateral balances
            _increaseETHBonded(nodeAddress, _bondAmount);
            _increaseETHBorrowed(nodeAddress, _amount - _bondAmount);
        }
        // Emit event
        emit FundsRequested(msg.sender, _validatorId, _amount, _expressQueue, block.timestamp);
    }

    /// @dev Called from a megapool to remove an entry in the validator queue and returns funds to node by credit mechanism
    /// @param _validatorId Internal ID of the validator to be removed
    /// @param _expressQueue Whether the entry is in the express queue or not
    function exitQueue(address _nodeAddress, uint32 _validatorId, bool _expressQueue) external onlyRegisteredMegapool(msg.sender) {
        LinkedListStorageInterface linkedListStorage = LinkedListStorageInterface(getContractAddress("linkedListStorage"));
        LinkedListStorageInterface.DepositQueueKey memory key = LinkedListStorageInterface.DepositQueueKey({
            receiver: msg.sender,
            validatorId: _validatorId
        });
        bytes32 namespace = getQueueNamespace(_expressQueue);
        uint256 index = linkedListStorage.getIndexOf(namespace, key);
        LinkedListStorageInterface.DepositQueueValue memory value = linkedListStorage.getItem(namespace, index);
        bool isAtHead = linkedListStorage.getHeadIndex(namespace) == index;
        linkedListStorage.removeItem(namespace, key);
        // Perform balance accounting
        subUint(requestedTotalKey, value.requestedValue * milliToWei);
        if (_expressQueue) {
            // Refund express ticket
            RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
            rocketNodeManager.refundExpressTicket(_nodeAddress);
            // Update head moved block
            if (isAtHead) {
                setQueueMoved(true, false);
            }
        } else {
            // Update head moved block
            if (isAtHead) {
                setQueueMoved(false, true);
            }
        }
        // Emit event
        emit QueueExited(_nodeAddress, block.timestamp);
    }

    /// @dev Called from megapool to increase a node operator's credit
    function applyCredit(address _nodeAddress, uint256 _amount) override external onlyRegisteredMegapool(msg.sender) {
        // Add to node's credit for the amount supplied
        addUint(keccak256(abi.encodePacked("node.deposit.credit.balance", _nodeAddress)), _amount);
        addUint(nodeBalanceKey, _amount);
    }

    /// @notice Allows node operator to withdraw any ETH credit they have as rETH
    /// @param _amount Amount in ETH to withdraw
    function withdrawCredit(uint256 _amount) override external onlyRegisteredNode(msg.sender) {
        // Check deposits are enabled
        RocketDAOProtocolSettingsDepositInterface rocketDAOProtocolSettingsDeposit = RocketDAOProtocolSettingsDepositInterface(getContractAddress("rocketDAOProtocolSettingsDeposit"));
        require(rocketDAOProtocolSettingsDeposit.getDepositEnabled(), "Deposits into Rocket Pool are currently disabled");
        // Check node operator has sufficient credit
        uint256 credit = getUint(keccak256(abi.encodePacked("node.deposit.credit.balance", msg.sender)));
        require(credit >= _amount, "Amount exceeds credit available");
        // Account for balance changes
        subUint(keccak256(abi.encodePacked("node.deposit.credit.balance", msg.sender)), _amount);
        subUint(nodeBalanceKey, _amount);
        // Note: The funds are already stored in RocketVault under RocketDepositPool so no ETH transfer is required
        // Get the node operator's withdrawal address
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        address nodeWithdrawalAddress = rocketNodeManager.getNodeWithdrawalAddress(msg.sender);
        // Calculate deposit fee
        unchecked { // depositFee < msg.value
            uint256 depositFee = _amount * rocketDAOProtocolSettingsDeposit.getDepositFee() / calcBase;
            uint256 depositNet = _amount - depositFee;
            // Mint rETH to node
            rocketTokenRETH.mint(depositNet, nodeWithdrawalAddress);
        }
        // Emit event
        emit CreditWithdrawn(msg.sender, _amount, block.timestamp);
    }

    /// @notice Gets the receiver next to be assigned and whether it can be assigned immediately
    /// @dev During the transition period from the legacy minipool queue, this will always return null address
    /// @return receiver Address of the receiver of the next assignment or null address for an empty queue
    /// @return assignmentPossible Whether there is enough funds in the pool to perform an assignment now
    /// @return headMovedBlock The block at which the receiver entered the top of the queue
    function getQueueTop() override external view returns (address receiver, bool assignmentPossible, uint256 headMovedBlock) {
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

        uint256 queueIndex = getUint(queueIndexKey);

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
        LinkedListStorageInterface.DepositQueueValue memory head = linkedListStorage.peekItem(namespace);
        assignmentPossible = rocketVault.balanceOf("rocketDepositPool") >= head.requestedValue * milliToWei;

        // Check assignments are enabled
        if (!rocketDAOProtocolSettingsDeposit.getAssignDepositsEnabled()) {
            assignmentPossible = false;
        }

        // Retrieve the block at which the entry at the top of the queue got to that position
        uint256 packed = getUint(queueMovedKey);
        if (express) {
            headMovedBlock = uint64(packed);
        } else {
            headMovedBlock = uint64(packed >> 128);
        }

        return (head.receiver, assignmentPossible, headMovedBlock);
    }

    /// @notice Retrieves the queue index (used for deciding whether to assign express or standard queue next)
    function getQueueIndex() override external view returns (uint256) {
        return getUint(queueIndexKey);
    }

    /// @notice Returns the number of minipools in the queue
    function getMinipoolQueueLength() override public view returns (uint256) {
        AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(getContractAddress("addressQueueStorage"));
        return addressQueueStorage.getLength(queueKeyVariable);
    }

    /// @notice Returns the number of megapools in the express queue
    function getExpressQueueLength() override public view returns (uint256) {
        LinkedListStorageInterface linkedListStorage = LinkedListStorageInterface(getContractAddress("linkedListStorage"));
        return linkedListStorage.getLength(expressQueueNamespace);
    }

    /// @notice Returns the number of megapools in the standard queue
    function getStandardQueueLength() override public view returns (uint256) {
        LinkedListStorageInterface linkedListStorage = LinkedListStorageInterface(getContractAddress("linkedListStorage"));
        return linkedListStorage.getLength(standardQueueNamespace);
    }

    /// @notice Returns the total number of minipools/megapools in the queue
    function getTotalQueueLength() override external view returns (uint256) {
        return getMinipoolQueueLength() + getExpressQueueLength() + getStandardQueueLength();
    }

    /// @dev Convenience method to return queue key for express and non-express queues
    function getQueueNamespace(bool _expressQueue) internal pure returns (bytes32) {
        if (_expressQueue) {
            return expressQueueNamespace;
        }
        return standardQueueNamespace;
    }

    /// @dev Called by a megapool during a bond reduction to adjust its capital ratio
    function reduceBond(address _nodeAddress, uint256 _amount) override external onlyRegisteredMegapool(msg.sender) {
        // Update collateral balances
        _increaseETHBorrowed(_nodeAddress, _amount);
        _decreaseETHBonded(_nodeAddress, _amount);
    }

    /// @dev Called by a megapool when exiting to handle change in capital ratio
    function fundsReturned(address _nodeAddress, uint256 _nodeAmount, uint256 _userAmount) override external onlyRegisteredMegapool(msg.sender) {
        // Update collateral balances
        _decreaseETHBonded(_nodeAddress, _nodeAmount);
        _decreaseETHBorrowed(_nodeAddress, _userAmount);
    }

    /// @dev Increases the amount of ETH supplied by a node operator as bond
    function _increaseETHBonded(address _nodeAddress, uint256 _amount) private {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        bytes32 key = keccak256(abi.encodePacked("megapool.eth.provided.node.amount", _nodeAddress));
        uint256 ethBonded = uint256(rocketNetworkSnapshots.latestValue(key)) + _amount;
        rocketNetworkSnapshots.push(key, uint224(ethBonded));
    }

    /// @dev Increases the amount of ETH borrowed by a node operator
    function _increaseETHBorrowed(address _nodeAddress, uint256 _amount) private {
        bytes32 key = keccak256(abi.encodePacked("megapool.eth.matched.node.amount", _nodeAddress));
        addUint(key, _amount);
    }

    /// @dev Decreases the amount of ETH bonded by a node operator as bond
    function _decreaseETHBonded(address _nodeAddress, uint256 _amount) private {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        bytes32 key = keccak256(abi.encodePacked("megapool.eth.provided.node.amount", _nodeAddress));
        uint256 ethBonded = uint256(rocketNetworkSnapshots.latestValue(key)) - _amount;
        rocketNetworkSnapshots.push(key, uint224(ethBonded));
    }

    /// @dev Decreases the amount of ETH borrowed by a node operator
    function _decreaseETHBorrowed(address _nodeAddress, uint256 _amount) private {
        bytes32 key = keccak256(abi.encodePacked("megapool.eth.matched.node.amount", _nodeAddress));
        subUint(key, _amount);
    }
}
