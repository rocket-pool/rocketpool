// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/cryptography/MerkleProof.sol";

import "./RocketMinipoolStorageLayout.sol";
import "../../interface/casper/DepositInterface.sol";
import "../../interface/deposit/RocketDepositPoolInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/minipool/RocketMinipoolQueueInterface.sol";
import "../../interface/minipool/RocketMinipoolPenaltyInterface.sol";
import "../../interface/network/RocketNetworkPricesInterface.sol";
import "../../interface/node/RocketNodeManagerInterface.sol";
import "../../interface/node/RocketNodeStakingInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import "../../interface/dao/node/settings/RocketDAONodeTrustedSettingsMinipoolInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol";
import "../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import "../../interface/network/RocketNetworkFeesInterface.sol";
import "../../interface/token/RocketTokenRETHInterface.sol";
import "../../types/MinipoolDeposit.sol";
import "../../types/MinipoolStatus.sol";
import "../../interface/node/RocketNodeDepositInterface.sol";

/// @notice Provides the logic for each individual minipool in the Rocket Pool network
/// @dev Minipools exclusively DELEGATECALL into this contract it is never called directly
contract RocketMinipoolDelegate is RocketMinipoolStorageLayout, RocketMinipoolInterface {


    // Constants
    uint8 public constant version = 3;                            // Used to identify which delegate contract each minipool is using
    uint256 constant calcBase = 1 ether;                          // Fixed point arithmetic uses this for value for precision
    uint256 constant distributionCooldown = 100;                  // Number of blocks that must pass between calls to distributeBalance

    // Libs
    using SafeMath for uint;

    // Events
    event StatusUpdated(uint8 indexed status, uint256 time);
    event ScrubVoted(address indexed member, uint256 time);
    event BegingBondReduction(uint256 time);
    event CancelReductionVoted(address indexed member, uint256 time);
    event ReductionCancelled(uint256 time);
    event MinipoolScrubbed(uint256 time);
    event MinipoolPrestaked(bytes validatorPubkey, bytes validatorSignature, bytes32 depositDataRoot, uint256 amount, bytes withdrawalCredentials, uint256 time);
    event MinipoolPromoted(uint256 time);
    event EtherDeposited(address indexed from, uint256 amount, uint256 time);
    event EtherWithdrawn(address indexed to, uint256 amount, uint256 time);
    event EtherWithdrawalProcessed(address indexed executed, uint256 nodeAmount, uint256 userAmount, uint256 totalBalance, uint256 time);

    // Status getters
    function getStatus() override external view returns (MinipoolStatus) { return status; }
    function getFinalised() override external view returns (bool) { return finalised; }
    function getStatusBlock() override external view returns (uint256) { return statusBlock; }
    function getStatusTime() override external view returns (uint256) { return statusTime; }
    function getScrubVoted(address _member) override external view returns (bool) { return memberScrubVotes[_member]; }

    // Deposit type getter
    function getDepositType() override external view returns (MinipoolDeposit) { return depositType; }

    // Node detail getters
    function getNodeAddress() override external view returns (address) { return nodeAddress; }
    function getNodeFee() override external view returns (uint256) { return nodeFee; }
    function getNodeDepositBalance() override external view returns (uint256) { return nodeDepositBalance; }
    function getNodeRefundBalance() override external view returns (uint256) { return nodeRefundBalance; }
    function getNodeDepositAssigned() override external view returns (bool) { return userDepositAssignedTime != 0; }
    function getPreLaunchValue() override external view returns (uint256) { return preLaunchValue; }
    function getNodeTopUpValue() override external view returns (uint256) { return nodeDepositBalance.sub(preLaunchValue); }

    // User deposit detail getters
    function getUserDepositBalance() override public view returns (uint256) {
        if (depositType == MinipoolDeposit.Variable) {
            return userDepositBalance;
        } else {
            return userDepositBalanceLegacy;
        }
    }
    function getUserDepositAssigned() override external view returns (bool) { return userDepositAssignedTime != 0; }
    function getUserDepositAssignedTime() override external view returns (uint256) { return userDepositAssignedTime; }
    function getTotalScrubVotes() override external view returns (uint256) { return totalScrubVotes; }

    /// @dev Prevent direct calls to this contract
    modifier onlyInitialised() {
        require(storageState == StorageState.Initialised, "Storage state not initialised");
        _;
    }

    /// @dev Prevent multiple calls to initialise
    modifier onlyUninitialised() {
        require(storageState == StorageState.Uninitialised, "Storage state already initialised");
        _;
    }

    /// @dev Only allow access from the owning node address
    modifier onlyMinipoolOwner(address _nodeAddress) {
        require(_nodeAddress == nodeAddress, "Invalid minipool owner");
        _;
    }

    /// @dev Only allow access from the owning node address or their withdrawal address
    modifier onlyMinipoolOwnerOrWithdrawalAddress(address _nodeAddress) {
        require(_nodeAddress == nodeAddress || _nodeAddress == rocketStorage.getNodeWithdrawalAddress(nodeAddress), "Invalid minipool owner");
        _;
    }

    /// @dev Only allow access from the latest version of the specified Rocket Pool contract
    modifier onlyLatestContract(string memory _contractName, address _contractAddress) {
        require(_contractAddress == getContractAddress(_contractName), "Invalid or outdated contract");
        _;
    }

    /// @dev Get the address of a Rocket Pool network contract
    /// @param _contractName The internal name of the contract to retrieve the address for
    function getContractAddress(string memory _contractName) private view returns (address) {
        address contractAddress = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", _contractName)));
        require(contractAddress != address(0x0), "Contract not found");
        return contractAddress;
    }

    /// @dev Called once on creation to initialise starting state
    /// @param _nodeAddress The address of the node operator who will own this minipool
    function initialise(address _nodeAddress) override external onlyUninitialised {
        // Check parameters
        require(_nodeAddress != address(0x0), "Invalid node address");
        // Load contracts
        RocketNetworkFeesInterface rocketNetworkFees = RocketNetworkFeesInterface(getContractAddress("rocketNetworkFees"));
        // Set initial status
        status = MinipoolStatus.Initialised;
        statusBlock = block.number;
        statusTime = block.timestamp;
        // Set details
        depositType = MinipoolDeposit.Variable;
        nodeAddress = _nodeAddress;
        nodeFee = rocketNetworkFees.getNodeFee();
        // Set the rETH address
        rocketTokenRETH = getContractAddress("rocketTokenRETH");
        // Set local copy of penalty contract
        rocketMinipoolPenalty = getContractAddress("rocketMinipoolPenalty");
        // Intialise storage state
        storageState = StorageState.Initialised;
    }

    /// @notice Performs the initial pre-stake on the beacon chain to set the withdrawal credentials
    /// @param _bondingValue The amount of the stake which will be provided by the node operator
    /// @param _validatorPubkey The public key of the validator
    /// @param _validatorSignature A signature over the deposit message object
    /// @param _depositDataRoot The hash tree root of the deposit data object
    function preDeposit(uint256 _bondingValue, bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) override external payable onlyLatestContract("rocketNodeDeposit", msg.sender) onlyInitialised {
        // Check current status & node deposit status
        require(status == MinipoolStatus.Initialised, "The pre-deposit can only be made while initialised");
        require(preLaunchValue == 0, "Pre-deposit already performed");
        // Update node deposit details
        nodeDepositBalance = _bondingValue;
        preLaunchValue = msg.value;
        // Emit ether deposited event
        emit EtherDeposited(msg.sender, preLaunchValue, block.timestamp);
        // Perform the pre-stake to lock in withdrawal credentials on beacon chain
        preStake(_validatorPubkey, _validatorSignature, _depositDataRoot);
    }

    /// @notice Performs the second deposit which provides the validator with the remaining balance to become active
    function deposit() override external payable onlyLatestContract("rocketDepositPool", msg.sender) onlyInitialised {
        // Check current status & node deposit status
        require(status == MinipoolStatus.Initialised, "The node deposit can only be assigned while initialised");
        require(userDepositAssignedTime == 0, "The user deposit has already been assigned");
        // Set the minipool status to prelaunch (ready for node to call `stake()`)
        setStatus(MinipoolStatus.Prelaunch);
        // Update deposit details
        userDepositBalance = msg.value.add(preLaunchValue).sub(nodeDepositBalance);
        userDepositAssignedTime = block.timestamp;
        // Emit ether deposited event
        emit EtherDeposited(msg.sender, msg.value, block.timestamp);
    }

    /// @notice Assign user deposited ETH to the minipool and mark it as prelaunch
    /// @dev No longer used in "Variable" type minipools (only retained for legacy minipools still in queue)
    function userDeposit() override external payable onlyLatestContract("rocketDepositPool", msg.sender) onlyInitialised {
        // Check current status & user deposit status
        require(status >= MinipoolStatus.Initialised && status <= MinipoolStatus.Staking, "The user deposit can only be assigned while initialised, in prelaunch, or staking");
        require(userDepositAssignedTime == 0, "The user deposit has already been assigned");
        // Progress initialised minipool to prelaunch
        if (status == MinipoolStatus.Initialised) { setStatus(MinipoolStatus.Prelaunch); }
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

    /// @notice Refund node ETH refinanced from user deposited ETH
    function refund() override external onlyMinipoolOwnerOrWithdrawalAddress(msg.sender) onlyInitialised {
        // Check refund balance
        require(nodeRefundBalance > 0, "No amount of the node deposit is available for refund");
        // Refund node
        _refund();
    }

    /// @notice Called to slash node operator's RPL balance if withdrawal balance was less than user deposit
    function slash() external override onlyInitialised {
        // Check there is a slash balance
        require(nodeSlashBalance > 0, "No balance to slash");
        // Perform slash
        _slash();
    }

    /// @notice Called by node operator to finalise the pool and unlock their RPL stake
    function finalise() external override onlyInitialised onlyMinipoolOwnerOrWithdrawalAddress(msg.sender) {
        // Can only call if withdrawable and can only be called once
        require(status == MinipoolStatus.Withdrawable, "Minipool must be withdrawable");
        // Node operator cannot finalise the pool unless distributeBalance has been called
        require(withdrawalBlock > 0, "Minipool balance must have been distributed at least once");
        // Finalise the pool
        _finalise();
    }

    /// @notice Returns true when `stake()` or `promote()` can be called by node operator taking into consideration the scrub period
    function canStake() override external view onlyInitialised returns (bool) {
        // Check status
        if (status != MinipoolStatus.Prelaunch) {
            return false;
        }
        // Get contracts
        RocketDAONodeTrustedSettingsMinipoolInterface rocketDAONodeTrustedSettingsMinipool = RocketDAONodeTrustedSettingsMinipoolInterface(getContractAddress("rocketDAONodeTrustedSettingsMinipool"));
        // Get scrub period
        uint256 scrubPeriod = rocketDAONodeTrustedSettingsMinipool.getScrubPeriod();
        // Check if we have been in prelaunch status for long enough
        return block.timestamp > statusTime + scrubPeriod;
    }

    /// @notice Progress the minipool to staking, sending its ETH deposit to the deposit contract. Only accepts calls from the minipool owner (node) while in prelaunch and once scrub period has ended
    /// @param _validatorSignature A signature over the deposit message object
    /// @param _depositDataRoot The hash tree root of the deposit data object
    function stake(bytes calldata _validatorSignature, bytes32 _depositDataRoot) override external onlyMinipoolOwner(msg.sender) onlyInitialised {
        // Get contracts
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        {
            // Get scrub period
            RocketDAONodeTrustedSettingsMinipoolInterface rocketDAONodeTrustedSettingsMinipool = RocketDAONodeTrustedSettingsMinipoolInterface(getContractAddress("rocketDAONodeTrustedSettingsMinipool"));
            uint256 scrubPeriod = rocketDAONodeTrustedSettingsMinipool.getScrubPeriod();
            // Check current status
            require(status == MinipoolStatus.Prelaunch, "The minipool can only begin staking while in prelaunch");
            require(block.timestamp > statusTime + scrubPeriod, "Not enough time has passed to stake");
            require(!vacant, "Cannot stake a vacant minipool");
        }
        // Progress to staking
        setStatus(MinipoolStatus.Staking);
        // Load contracts
        DepositInterface casperDeposit = DepositInterface(getContractAddress("casperDeposit"));
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        // Get launch amount
        uint256 launchAmount = rocketDAOProtocolSettingsMinipool.getLaunchBalance();
        uint256 depositAmount = launchAmount.sub(preLaunchValue);
        // Check minipool balance
        require(address(this).balance >= depositAmount, "Insufficient balance to begin staking");
        // Retrieve validator pubkey from storage
        bytes memory validatorPubkey = rocketMinipoolManager.getMinipoolPubkey(address(this));
        // Send staking deposit to casper
        casperDeposit.deposit{value : depositAmount}(validatorPubkey, rocketMinipoolManager.getMinipoolWithdrawalCredentials(address(this)), _validatorSignature, _depositDataRoot);
        // Increment node's number of staking minipools
        rocketMinipoolManager.incrementNodeStakingMinipoolCount(nodeAddress);
    }

    /// @dev Sets the bonding value and vacancy flag on this minipool
    /// @param _bondAmount The bond amount selected by the node operator
    function prepareVacancy(uint256 _bondAmount) override external onlyLatestContract("rocketMinipoolManager", msg.sender) onlyInitialised {
        // Get contracts
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        // Store bond amount
        nodeDepositBalance = _bondAmount;
        // Calculate user amount from launch amount
        uint256 launchAmount = rocketDAOProtocolSettingsMinipool.getLaunchBalance();
        userDepositBalance = uint256(32 ether).sub(_bondAmount);
        // Flag as vacant
        vacant = true;
    }

    /// @dev Promotes this minipool to a complete minipool
    function promote() override external onlyMinipoolOwner(msg.sender) onlyInitialised {
        // Check status
        require(status == MinipoolStatus.Prelaunch, "The minipool can only promote while in prelaunch");
        require(vacant, "Cannot promote a non-vacant minipool");
        // Clear vacant flag
        vacant = false;
        // Check scrub period
        RocketDAONodeTrustedSettingsMinipoolInterface rocketDAONodeTrustedSettingsMinipool = RocketDAONodeTrustedSettingsMinipoolInterface(getContractAddress("rocketDAONodeTrustedSettingsMinipool"));
        uint256 scrubPeriod = rocketDAONodeTrustedSettingsMinipool.getScrubPeriod();
        require(block.timestamp > statusTime + scrubPeriod, "Not enough time has passed to promote");
        // Progress to staking
        setStatus(MinipoolStatus.Staking);
        // Increment node's number of staking minipools
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        rocketMinipoolManager.incrementNodeStakingMinipoolCount(nodeAddress);
        // Set deposit assigned time
        userDepositAssignedTime = block.timestamp;
        // Increase node operator's deposit credit
        RocketNodeDepositInterface rocketNodeDepositInterface = RocketNodeDepositInterface(getContractAddress("rocketNodeDeposit"));
        rocketNodeDepositInterface.increaseDepositCreditBalance(nodeAddress, userDepositBalance);
        // Remove from vacant set
        rocketMinipoolManager.removeVacantMinipool();
        // Emit event
        emit MinipoolPromoted(block.timestamp);
    }

    /// @dev Stakes the balance of this minipool into the deposit contract to set withdrawal credentials to this contract
    /// @param _validatorSignature A signature over the deposit message object
    /// @param _depositDataRoot The hash tree root of the deposit data object
    function preStake(bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) internal {
        // Load contracts
        DepositInterface casperDeposit = DepositInterface(getContractAddress("casperDeposit"));
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        // Check validator pubkey is not in use
        require(rocketMinipoolManager.getMinipoolByPubkey(_validatorPubkey) == address(0x0), "Validator pubkey is in use");
        // Set minipool pubkey
        rocketMinipoolManager.setMinipoolPubkey(_validatorPubkey);
        // Get withdrawal credentials
        bytes memory withdrawalCredentials = rocketMinipoolManager.getMinipoolWithdrawalCredentials(address(this));
        // Send staking deposit to casper
        casperDeposit.deposit{value : address(this).balance}(_validatorPubkey, withdrawalCredentials, _validatorSignature, _depositDataRoot);
        // Emit event
        emit MinipoolPrestaked(_validatorPubkey, _validatorSignature, _depositDataRoot, preLaunchValue, withdrawalCredentials, block.timestamp);
    }

    /// @notice Mark this minipool as withdrawable.
    ///         Can only be called by rocketMinipoolStatus which calls when consensus between trusted nodes is reached.
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
        // Decrement the node operator's staking minipool count
        rocketMinipoolManager.decrementNodeStakingMinipoolCount(nodeAddress);
    }

    /// @notice Distributes the contract's balance and finalises the pool.
    /// Can only be called by the owner.
    function distributeBalanceAndFinalise() override external onlyInitialised onlyMinipoolOwnerOrWithdrawalAddress(msg.sender) {
        // Can only call if withdrawable and can only be called once
        require(status == MinipoolStatus.Withdrawable, "Minipool must be withdrawable");
        // Get withdrawal amount, we must also account for a possible node refund balance on the contract from users staking 32 ETH that have received a 16 ETH refund after the protocol bought out 16 ETH
        uint256 totalBalance = address(this).balance.sub(nodeRefundBalance);
        // Process withdrawal
        _distributeBalance(totalBalance);
        // Finalise the pool
        _finalise();
    }

    /// @notice Distributes the contract's balance.
    /// When called during staking status, requires 16 ether in the pool.
    /// When called by non-owner with less than 16 ether, requires 14 days to have passed since being made withdrawable
    function distributeBalance() override external onlyInitialised {
        // Must be called while staking or withdrawable
        require(status == MinipoolStatus.Staking || status == MinipoolStatus.Withdrawable, "Minipool must be staking or withdrawable");
        // Get withdrawal amount, we must also account for a possible node refund balance on the contract from users staking 32 ETH that have received a 16 ETH refund after the protocol bought out 16 ETH
        uint256 totalBalance = address(this).balance.sub(nodeRefundBalance);
        // Get node withdrawal address
        address nodeWithdrawalAddress = rocketStorage.getNodeWithdrawalAddress(nodeAddress);
        // If it's not the owner calling
        if (msg.sender != nodeAddress && msg.sender != nodeWithdrawalAddress) {
            // And the pool is in staking status
            if (status == MinipoolStatus.Staking) {
                // Then balance must be greater than 16 ETH
                require(totalBalance >= 16 ether, "Balance must be greater than 16 ETH");
            } else {
                // Then enough time must have elapsed
                require(block.timestamp > statusTime.add(14 days), "Non-owner must wait 14 days after withdrawal to distribute balance");
                // And balance must be greater than 4 ETH
                require(address(this).balance >= 4 ether, "Balance must be greater than 4 ETH");
            }
        }
        // Process withdrawal
        _distributeBalance(totalBalance);
    }

    /// @dev Perform any slashings, refunds, and unlock NO's stake
    function _finalise() private {
        // Get contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        // Can only finalise the pool once
        require(!finalised, "Minipool has already been finalised");
        // Set finalised flag
        finalised = true;
        // If slash is required then perform it
        if (nodeSlashBalance > 0) {
            _slash();
        }
        // Refund node operator if required
        if (nodeRefundBalance > 0) {
            _refund();
        }
        // Send any left over ETH to rETH contract
        if (address(this).balance > 0) {
            // Send user amount to rETH contract
            payable(rocketTokenRETH).transfer(address(this).balance);
        }
        // Trigger a deposit of excess collateral from rETH contract to deposit pool
        RocketTokenRETHInterface(rocketTokenRETH).depositExcessCollateral();
        // Unlock node operator's RPL
        rocketMinipoolManager.incrementNodeFinalisedMinipoolCount(nodeAddress);
        // Update unbonded validator count if minipool is unbonded
        if (depositType == MinipoolDeposit.Empty) {
            RocketDAONodeTrustedInterface rocketDAONodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
            rocketDAONodeTrusted.decrementMemberUnbondedValidatorCount(nodeAddress);
        }
    }

    /// @dev Distributes balance to user and node operator
    /// @param _balance The amount to distribute
    function _distributeBalance(uint256 _balance) private {
        // Rate limit this method to prevent front running
        require(block.number > withdrawalBlock + distributionCooldown, "Distribution of this minipool's balance is on cooldown");
        // Deposit amounts
        uint256 nodeAmount = 0;
        uint256 userCapital = getUserDepositBalance();
        // Check if node operator was slashed
        if (_balance < userCapital) {
            // Only slash on first call to distribute
            if (withdrawalBlock == 0) {
                // Record shortfall for slashing
                nodeSlashBalance = userCapital.sub(_balance);
            }
        } else {
            // Calculate node's share of the balance
            nodeAmount = calculateNodeShare(_balance);
        }
        // User amount is what's left over from node's share
        uint256 userAmount = _balance.sub(nodeAmount);
        // Pay node operator via refund
        nodeRefundBalance = nodeRefundBalance.add(nodeAmount);
        // Pay user amount to rETH contract
        if (userAmount > 0) {
            // Send user amount to rETH contract
            payable(rocketTokenRETH).transfer(userAmount);
        }
        // Save block to prevent multiple withdrawals within a few blocks
        withdrawalBlock = block.number;
        // Log it
        emit EtherWithdrawalProcessed(msg.sender, nodeAmount, userAmount, _balance, block.timestamp);
    }

    /// @notice Given a validator balance, this function returns what portion of it belongs to the node taking into
    /// consideration the minipool's commission rate and any penalties it may have attracted
    /// @param _balance The balance to calculate the node share of
    function calculateNodeShare(uint256 _balance) override public view returns (uint256) {
        uint256 userCapital = getUserDepositBalance();
        uint256 nodeCapital = nodeDepositBalance;
        uint256 nodeShare = 0;
        // Calculate the total capital (node + user)
        uint256 capital = userCapital.add(nodeCapital);
        if (_balance > capital) {
            // Total rewards to share
            uint256 rewards = _balance.sub(capital);
            // Calculate node and user portion based on proportions of capital provided
            uint256 nodePortion = rewards.mul(nodeCapital).div(userCapital.add(nodeCapital));
            uint256 userPortion = rewards.sub(nodePortion);
            // Calculate final node amount as combination of node capital, node share and commission on user share
            nodeShare = nodeCapital.add(nodePortion.add(userPortion.mul(nodeFee).div(calcBase)));
        } else if (_balance > userCapital) {
            nodeShare = _balance.sub(userCapital);
        }
        // Check if node has an ETH penalty
        uint256 penaltyRate = RocketMinipoolPenaltyInterface(rocketMinipoolPenalty).getPenaltyRate(address(this));
        if (penaltyRate > 0) {
            uint256 penaltyAmount = nodeShare.mul(penaltyRate).div(calcBase);
            if (penaltyAmount > nodeShare) {
                penaltyAmount = nodeShare;
            }
            nodeShare = nodeShare.sub(penaltyAmount);
        }
        return nodeShare;
    }

    /// @notice Given a validator balance, this function returns what portion of it belongs to rETH users taking into
    /// consideration the minipool's commission rate and any penalties it may have attracted
    /// @param _balance The balance to calculate the user share of
    function calculateUserShare(uint256 _balance) override external view returns (uint256) {
        // User's share is just the balance minus node's share
        return _balance.sub(calculateNodeShare(_balance));
    }

    /// @notice Dissolve the minipool, returning user deposited ETH to the deposit pool.
    /// Only accepts calls from the minipool owner (node), or from any address if timed out
    function dissolve() override external onlyInitialised {
        // Check current status
        require(status == MinipoolStatus.Initialised || status == MinipoolStatus.Prelaunch, "The minipool can only be dissolved while initialised or in prelaunch");
        // Load contracts
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        // Check if being dissolved by minipool owner or minipool is timed out
        require(
            (status == MinipoolStatus.Prelaunch && block.timestamp.sub(statusTime) >= rocketDAOProtocolSettingsMinipool.getLaunchTimeout()),
            "The minipool can only be dissolved once it has timed out"
        );
        // Perform the dissolution
        _dissolve();
    }

    /// @notice Withdraw node balances from the minipool and close it. Only accepts calls from the owner
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
            (bool success,) = nodeWithdrawalAddress.call{value : nodeBalance}("");
            require(success, "Node ETH balance was not successfully transferred to node operator");
            // Emit ether withdrawn event
            emit EtherWithdrawn(nodeWithdrawalAddress, nodeBalance, block.timestamp);
        }
        // Update unbonded validator count if minipool is unbonded
        if (depositType == MinipoolDeposit.Empty) {
            RocketDAONodeTrustedInterface rocketDAONodeTrusted = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
            rocketDAONodeTrusted.decrementMemberUnbondedValidatorCount(nodeAddress);
        }
        // Destroy minipool
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        rocketMinipoolManager.destroyMinipool();
        // Self destruct
        selfdestruct(payable(rocketTokenRETH));
    }

    /// @notice Can be called by trusted nodes to scrub this minipool if its withdrawal credentials are not set correctly
    function voteScrub() override external onlyInitialised {
        // Check current status
        require(status == MinipoolStatus.Prelaunch, "The minipool can only be scrubbed while in prelaunch");
        // Get contracts
        RocketDAONodeTrustedInterface rocketDAONode = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        RocketDAONodeTrustedSettingsMinipoolInterface rocketDAONodeTrustedSettingsMinipool = RocketDAONodeTrustedSettingsMinipoolInterface(getContractAddress("rocketDAONodeTrustedSettingsMinipool"));
        // Must be a trusted member
        require(rocketDAONode.getMemberIsValid(msg.sender), "Not a trusted member");
        // Can only vote once
        require(!memberScrubVotes[msg.sender], "Member has already voted to scrub");
        memberScrubVotes[msg.sender] = true;
        // Emit event
        emit ScrubVoted(msg.sender, block.timestamp);
        // Check if required quorum has voted
        uint256 quorum = rocketDAONode.getMemberCount().mul(rocketDAONodeTrustedSettingsMinipool.getScrubQuorum()).div(calcBase);
        if (totalScrubVotes.add(1) > quorum) {
            // Dissolve this minipool, recycling ETH back to deposit pool
            _dissolve();
            // Slash RPL equal to minimum stake amount (if enabled)
            if (rocketDAONodeTrustedSettingsMinipool.getScrubPenaltyEnabled()){
                RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
                RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
                RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
                rocketNodeStaking.slashRPL(nodeAddress, rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount()
                .mul(rocketDAOProtocolSettingsNode.getMinimumPerMinipoolStake())
                .div(calcBase)
                );
            }
            // Emit event
            emit MinipoolScrubbed(block.timestamp);
        } else {
            // Increment total
            totalScrubVotes = totalScrubVotes.add(1);
        }
    }

    /// @notice Flags this minipool as wanting to reduce collateral, owner can then call `reduceBondAmount` once waiting
    ///         period has elapsed
    function beginReduceBondAmount() override external onlyMinipoolOwner(msg.sender) onlyInitialised {
        require(!reductionCancelled, "This minipool is allowed to reduce bond");
        reduceBondTime = block.timestamp;
    }

    /// @notice Returns whether owner can reduce bond amount given the waiting period constraint
    function canReduceBondAmount() override public view returns (bool) {
        // TODO: Should this period be configurable or is hardcoded to between 7 and 9 days suitable?
        return block.timestamp >= reduceBondTime.add(7 days) && block.timestamp < reduceBondTime.add(9 days);
    }

    /// @notice Can be called by trusted nodes to cancel a reduction in bond if the validator has too low of a balance
    function voteCancelReduction() override external onlyInitialised {
        require(!memberCancelVotes[msg.sender], "Member has already voted to cancel");
        memberCancelVotes[msg.sender] = true;
        // Emit event
        emit CancelReductionVoted(msg.sender, block.timestamp);
        // Check if required quorum has voted
        RocketDAONodeTrustedInterface rocketDAONode = RocketDAONodeTrustedInterface(getContractAddress("rocketDAONodeTrusted"));
        RocketDAONodeTrustedSettingsMinipoolInterface rocketDAONodeTrustedSettingsMinipool = RocketDAONodeTrustedSettingsMinipoolInterface(getContractAddress("rocketDAONodeTrustedSettingsMinipool"));
        // TODO: Use the scrub quorum or create a separate setting?
        uint256 quorum = rocketDAONode.getMemberCount().mul(rocketDAONodeTrustedSettingsMinipool.getScrubQuorum()).div(calcBase);
        if (totalCancelVotes.add(1) > quorum) {
            // Emit event
            emit ReductionCancelled(block.timestamp);
            reductionCancelled = true;
            reduceBondTime = 0;
        } else {
            // Increment total
            totalCancelVotes = totalCancelVotes.add(1);
        }
    }

    /// @notice Reduces the ETH bonding amount and credits the owner the difference
    /// @param _amount The amount to reduce the bond to (e.g. 8 ether)
    function reduceBondAmount(uint256 _amount) external onlyMinipoolOwner(msg.sender) onlyInitialised {
        require(canReduceBondAmount(), "Wait period not satisfied");
        require(!reductionCancelled, "This minipool is allowed to reduce bond");
        require(_amount < nodeDepositBalance, "Bond must be lower than current amount");
        require(status == MinipoolStatus.Staking, "Minipool must be staking");
        // Get contracts
        RocketNodeDepositInterface rocketNodeDepositInterface = RocketNodeDepositInterface(getContractAddress("rocketNodeDeposit"));
        // Check the new bond amount is valid
        require(rocketNodeDepositInterface.isValidDepositAmount(_amount), "Invalid bond amount");
        // Update user/node balances
        uint256 delta = nodeDepositBalance.sub(_amount);
        userDepositBalance = getUserDepositBalance().add(delta);
        nodeDepositBalance = _amount;
        // Reset node fee to current network rate
        RocketNetworkFeesInterface rocketNetworkFees = RocketNetworkFeesInterface(getContractAddress("rocketNetworkFees"));
        nodeFee = rocketNetworkFees.getNodeFee();
        // Increase node operator's deposit credit
        rocketNodeDepositInterface.increaseDepositCreditBalance(nodeAddress, delta);
        // Break state to prevent rollback exploit
        if (depositType != MinipoolDeposit.Variable) {
            userDepositBalanceLegacy = 2**256-1;
            depositType = MinipoolDeposit.Variable;
        }
    }

    /// @dev Set the minipool's current status
    /// @param _status The new status
    function setStatus(MinipoolStatus _status) private {
        // Update status
        status = _status;
        statusBlock = block.number;
        statusTime = block.timestamp;
        // Emit status updated event
        emit StatusUpdated(uint8(_status), block.timestamp);
    }

    /// @dev Transfer refunded ETH balance to the node operator
    function _refund() private {
        // Update refund balance
        uint256 refundAmount = nodeRefundBalance;
        nodeRefundBalance = 0;
        // Get node withdrawal address
        address nodeWithdrawalAddress = rocketStorage.getNodeWithdrawalAddress(nodeAddress);
        // Transfer refund amount
        (bool success,) = nodeWithdrawalAddress.call{value : refundAmount}("");
        require(success, "ETH refund amount was not successfully transferred to node operator");
        // Emit ether withdrawn event
        emit EtherWithdrawn(nodeWithdrawalAddress, refundAmount, block.timestamp);
    }

    /// @dev Slash node operator's RPL balance based on nodeSlashBalance
    function _slash() private {
        // Get contracts
        RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
        // Slash required amount and reset storage value
        uint256 slashAmount = nodeSlashBalance;
        nodeSlashBalance = 0;
        rocketNodeStaking.slashRPL(nodeAddress, slashAmount);
    }

    /// @dev Dissolve this minipool
    function _dissolve() private {
        // Get contracts
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        RocketMinipoolQueueInterface rocketMinipoolQueue = RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue"));
        // Progress to dissolved
        setStatus(MinipoolStatus.Dissolved);
        // Transfer user balance to deposit pool
        uint256 userCapital = getUserDepositBalance();
        if (userCapital > 0) {
            // Store value in local
            uint256 recycleAmount = userCapital;
            // Clear storage
            userDepositBalance = 0;
            userDepositBalanceLegacy = 0;
            userDepositAssignedTime = 0;
            // Transfer
            rocketDepositPool.recycleDissolvedDeposit{value : recycleAmount}();
            // Emit ether withdrawn event
            emit EtherWithdrawn(address(rocketDepositPool), recycleAmount, block.timestamp);
        } else {
            rocketMinipoolQueue.removeMinipool(depositType);
        }
        // Handle vacant minipool
        if (vacant) {
            RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
            rocketMinipoolManager.removeVacantMinipool();
        }
    }
}
