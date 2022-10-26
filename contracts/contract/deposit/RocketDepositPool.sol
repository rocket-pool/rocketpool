// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "@openzeppelin/contracts/utils/SafeCast.sol";

import "../RocketBase.sol";
import "../../interface/RocketVaultInterface.sol";
import "../../interface/RocketVaultWithdrawerInterface.sol";
import "../../interface/deposit/RocketDepositPoolInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolQueueInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsDepositInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";
import "../../interface/token/RocketTokenRETHInterface.sol";
import "../../types/MinipoolDeposit.sol";

/// @notice Accepts user deposits and mints rETH; handles assignment of deposited ETH to minipools
contract RocketDepositPool is RocketBase, RocketDepositPoolInterface, RocketVaultWithdrawerInterface {

    // Libs
    using SafeMath for uint256;
    using SignedSafeMath for int256;
    using SafeCast for uint256;

    // Immutables
    RocketVaultInterface immutable rocketVault;
    RocketTokenRETHInterface immutable rocketTokenRETH;

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
        return getBalance().toInt256().sub(getNodeBalance().toInt256());
    }

    /// @notice Excess deposit pool balance (in excess of minipool queue capacity)
    function getExcessBalance() override public view returns (uint256) {
        // Get minipool queue capacity
        RocketMinipoolQueueInterface rocketMinipoolQueue = RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue"));
        uint256 minipoolCapacity = rocketMinipoolQueue.getEffectiveCapacity();
        uint256 balance = getBalance();
        // Calculate and return
        if (minipoolCapacity >= balance) { return 0; }
        else { return balance.sub(minipoolCapacity); }
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
        uint256 capacityNeeded = rocketVault.balanceOf("rocketDepositPool").add(msg.value);
        if (capacityNeeded > rocketDAOProtocolSettingsDeposit.getMaximumDepositPoolSize()) {
            // Doing a conditional require() instead of a single one optimises for the common
            // case where capacityNeeded fits in the deposit pool without looking at the queue
            if (rocketDAOProtocolSettingsDeposit.getAssignDepositsEnabled()) {
                RocketMinipoolQueueInterface rocketMinipoolQueue = RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue"));
                require(capacityNeeded <= rocketDAOProtocolSettingsDeposit.getMaximumDepositPoolSize() + rocketMinipoolQueue.getEffectiveCapacity(),
                    "The deposit pool size after depositing (and matching with minipools) exceeds the maximum size");
            } else {
                revert("The deposit pool size after depositing exceeds the maximum size");
            }
        }
        // Calculate deposit fee
        uint256 depositFee = msg.value.mul(rocketDAOProtocolSettingsDeposit.getDepositFee()).div(calcBase);
        uint256 depositNet = msg.value.sub(depositFee);
        // Mint rETH to user account
        rocketTokenRETH.mint(depositNet, msg.sender);
        // Emit deposit received event
        emit DepositReceived(msg.sender, msg.value, block.timestamp);
        // Process deposit
        processDeposit(rocketDAOProtocolSettingsDeposit);
    }

    /// @dev Accepts ETH deposit from the node deposit contract (does not mint rETH)
    function nodeDeposit() override external payable onlyThisLatestContract onlyLatestContract("rocketNodeDeposit", msg.sender) {
        // Deposit ETH into the vault
        rocketVault.depositEther{value: msg.value}();
        // Increase recorded node balance
        addUint("deposit.pool.node.balance", msg.value);
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
    function recycleDissolvedDeposit() override external payable onlyThisLatestContract onlyRegisteredMinipool(msg.sender) {
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

    /// @dev Assign deposits to available minipools
    function assignDeposits() override external onlyThisLatestContract {
        // Load contracts
        RocketDAOProtocolSettingsDepositInterface rocketDAOProtocolSettingsDeposit = RocketDAOProtocolSettingsDepositInterface(getContractAddress("rocketDAOProtocolSettingsDeposit"));
        // Revert if assigning is disabled
        require(_assignDeposits(rocketDAOProtocolSettingsDeposit), "Deposit assignments are currently disabled");
    }

    /// @dev Assigns deposits to available minipools, returns false if assignment is currently disabled
    function _assignDeposits(RocketDAOProtocolSettingsDepositInterface _rocketDAOProtocolSettingsDeposit) private returns (bool) {
        // Check if assigning deposits is enabled
        if (!_rocketDAOProtocolSettingsDeposit.getAssignDepositsEnabled()) {
            return false;
        }
        // Load contracts
        RocketMinipoolQueueInterface rocketMinipoolQueue = RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue"));
        // Decide which queue processing implementation to use based on queue contents
        if (rocketMinipoolQueue.getContainsLegacy()) {
            return _assignDepositsLegacy(rocketMinipoolQueue, _rocketDAOProtocolSettingsDeposit);
        } else {
            return _assignDepositsNew(rocketMinipoolQueue, _rocketDAOProtocolSettingsDeposit);
        }
    }

    /// @dev Assigns deposits using the new minipool queue
    function _assignDepositsNew(RocketMinipoolQueueInterface _rocketMinipoolQueue, RocketDAOProtocolSettingsDepositInterface _rocketDAOProtocolSettingsDeposit) private returns (bool) {
        // Load contracts
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        // Calculate the number of minipools to assign
        uint256 maxAssignments = _rocketDAOProtocolSettingsDeposit.getMaximumDepositAssignments();
        uint256 variableDepositAmount = rocketDAOProtocolSettingsMinipool.getVariableDepositAmount();
        uint256 scalingCount = msg.value.div(variableDepositAmount);
        uint256 totalEthCount = rocketVault.balanceOf("rocketDepositPool").div(variableDepositAmount);
        uint256 assignments = _rocketDAOProtocolSettingsDeposit.getMaximumDepositSocialisedAssignments().add(scalingCount);
        if (assignments > totalEthCount) {
            assignments = totalEthCount;
        }
        if (assignments > maxAssignments) {
            assignments = maxAssignments;
        }
        address[] memory minipools = _rocketMinipoolQueue.dequeueMinipools(assignments);
        if (minipools.length > 0){
            // Withdraw ETH from vault
            uint256 totalEther = minipools.length.mul(variableDepositAmount);
            rocketVault.withdrawEther(totalEther);
            uint256 nodeBalanceUsed = 0;
            // Loop over minipools and deposit the amount required to reach launch balance
            for (uint256 i = 0; i < minipools.length; i++) {
                RocketMinipoolInterface minipool = RocketMinipoolInterface(minipools[i]);
                // Assign deposit to minipool
                minipool.deposit{value: variableDepositAmount}();
                nodeBalanceUsed = nodeBalanceUsed.add(minipool.getNodeTopUpValue());
                // Emit deposit assigned event
                emit DepositAssigned(minipools[i], variableDepositAmount, block.timestamp);
            }
            // Decrease node balance
            subUint("deposit.pool.node.balance", nodeBalanceUsed);
        }
        return true;
    }

    /// @dev Assigns deposits using the legacy minipool queue
    function _assignDepositsLegacy(RocketMinipoolQueueInterface _rocketMinipoolQueue, RocketDAOProtocolSettingsDepositInterface _rocketDAOProtocolSettingsDeposit) private returns (bool) {
        // Load contracts
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        // Setup initial variable values
        uint256 balance = rocketVault.balanceOf("rocketDepositPool");
        uint256 totalEther = 0;
        // Calculate minipool assignments
        uint256 maxAssignments = _rocketDAOProtocolSettingsDeposit.getMaximumDepositAssignments();
        MinipoolAssignment[] memory assignments = new MinipoolAssignment[](maxAssignments);
        MinipoolDeposit depositType = MinipoolDeposit.None;
        uint256 count = 0;
        uint256 minipoolCapacity = 0;
        for (uint256 i = 0; i < maxAssignments; ++i) {
            // Optimised for multiple of the same deposit type
            if (count == 0) {
                (depositType, count) = _rocketMinipoolQueue.getNextDepositLegacy();
                if (depositType == MinipoolDeposit.None) { break; }
                minipoolCapacity = rocketDAOProtocolSettingsMinipool.getDepositUserAmount(depositType);
            }
            count--;
            if (minipoolCapacity == 0 || balance.sub(totalEther) < minipoolCapacity) { break; }
            // Dequeue the minipool
            address minipoolAddress = _rocketMinipoolQueue.dequeueMinipoolByDepositLegacy(depositType);
            // Update running total
            totalEther = totalEther.add(minipoolCapacity);
            // Add assignment
            assignments[i].etherAssigned = minipoolCapacity;
            assignments[i].minipoolAddress = minipoolAddress;
        }
        if (totalEther > 0) {
            // Withdraw ETH from vault
            rocketVault.withdrawEther(totalEther);
            // Perform assignments
            for (uint256 i = 0; i < maxAssignments; ++i) {
                if (assignments[i].etherAssigned == 0) { break; }
                RocketMinipoolInterface minipool = RocketMinipoolInterface(assignments[i].minipoolAddress);
                // Assign deposit to minipool
                minipool.userDeposit{value: assignments[i].etherAssigned}();
                // Emit deposit assigned event
                emit DepositAssigned(assignments[i].minipoolAddress, assignments[i].etherAssigned, block.timestamp);
            }
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
}
