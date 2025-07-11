// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import "../../interface/RocketVaultInterface.sol";

import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsRewardsInterface.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/network/RocketNetworkPricesInterface.sol";
import "../../interface/network/RocketNetworkSnapshotsInterface.sol";
import "../../interface/network/RocketNetworkVotingInterface.sol";
import "../../interface/node/RocketNodeManagerInterface.sol";
import "../../interface/node/RocketNodeStakingInterface.sol";
import "../../interface/token/RocketTokenRPLInterface.sol";
import "../../interface/util/AddressSetStorageInterface.sol";
import "../../interface/util/IERC20.sol";
import "../RocketBase.sol";
import "../network/RocketNetworkSnapshots.sol";

/// @notice Handles staking of RPL by node operators
contract RocketNodeStaking is RocketBase, RocketNodeStakingInterface {
    // Immutables
    bytes32 immutable internal totalKey;
    bytes32 immutable internal totalMegapoolKey;
    RocketTokenRPLInterface immutable internal rplToken;
    RocketVaultInterface immutable internal rocketVault;

    // Events
    event RPLStaked(address indexed node, address from, uint256 amount, uint256 time);
    event RPLStaked(address indexed from, uint256 amount, uint256 time);
    event RPLUnstaked(address indexed from, uint256 amount, uint256 time);
    event RPLLegacyUnstaked(address indexed to, uint256 amount, uint256 time);
    event RPLWithdrawn(address indexed to, uint256 amount, uint256 time);
    event RPLSlashed(address indexed node, uint256 amount, uint256 ethValue, uint256 time);
    event StakeRPLForAllowed(address indexed node, address indexed caller, bool allowed, uint256 time);
    event RPLLockingAllowed(address indexed node, bool allowed, uint256 time);
    event RPLLocked(address indexed from, uint256 amount, uint256 time);
    event RPLUnlocked(address indexed from, uint256 amount, uint256 time);
    event RPLTransferred(address indexed from, address indexed to, uint256 amount, uint256 time);
    event RPLBurned(address indexed from, uint256 amount, uint256 time);

    /// @dev Reverts if not being called from a node or their RPL withdrawal address
    modifier onlyRPLWithdrawalAddressOrNode(address _nodeAddress) {
        // Check that the call is coming from RPL withdrawal address (or node if unset)
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        if (rocketNodeManager.getNodeRPLWithdrawalAddressIsSet(_nodeAddress)) {
            address rplWithdrawalAddress = rocketNodeManager.getNodeRPLWithdrawalAddress(_nodeAddress);
            require(msg.sender == rplWithdrawalAddress, "Must be called from RPL withdrawal address");
        } else {
            require(msg.sender == _nodeAddress, "Must be called from node address");
        }
        _;
    }

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 7;
        // Precompute keys
        totalKey = keccak256(abi.encodePacked("rpl.staked.total.amount"));
        totalMegapoolKey = keccak256(abi.encodePacked("rpl.megapool.staked.total.amount"));
        // Store immutable contract references
        rplToken = RocketTokenRPLInterface(getContractAddress("rocketTokenRPL"));
        rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
    }

    /// @notice Returns the total quantity of RPL staked on the network
    function getTotalStakedRPL() override public view returns (uint256) {
        return getUint(totalKey);
    }

    /// @notice Returns the total quantity of RPL staked on the network
    function getTotalMegapoolStakedRPL() override public view returns (uint256) {
        return getUint(totalMegapoolKey);
    }

    /// @notice Returns the total amount of "Legacy Staked RPL" in the protocol
    function getTotalLegacyStakedRPL() override external view returns (uint256) {
        return getTotalStakedRPL() - getTotalMegapoolStakedRPL();
    }

    /// @notice Returns the total amount of RPL staked by a node operator (both legacy and megapool staked RPL)
    /// @param _nodeAddress The address of the node operator to query
    function getNodeStakedRPL(address _nodeAddress) override public view returns (uint256) {
        bytes32 key = keccak256(abi.encodePacked("rpl.staked.node.amount", _nodeAddress));
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        (,, uint224 value) = rocketNetworkSnapshots.latest(key);
        return uint256(value);
    }

    /// @notice Returns the amount of legacy staked RPL for a node operator
    /// @notice _nodeAddress Address of the node operator to query
    function getNodeLegacyStakedRPL(address _nodeAddress) override public view returns (uint256) {
        bytes32 migratedKey = keccak256(abi.encodePacked("rpl.legacy.staked.node.migrated", _nodeAddress));
        if (getBool(migratedKey)) {
            bytes32 legacyKey = keccak256(abi.encodePacked("rpl.legacy.staked.node.amount", _nodeAddress));
            return getUint(legacyKey);
        }
        return getNodeStakedRPL(_nodeAddress);
    }

    /// @notice Returns the amount of megapool staked RPL for a node operator
    /// @notice _nodeAddress Address of the node operator to query
    function getNodeMegapoolStakedRPL(address _nodeAddress) override external view returns (uint256) {
        bytes32 migratedKey = keccak256(abi.encodePacked("rpl.legacy.staked.node.migrated", _nodeAddress));
        if (!getBool(migratedKey)) {
            return 0;
        }
        bytes32 legacyKey = keccak256(abi.encodePacked("rpl.legacy.staked.node.amount", _nodeAddress));
        return getNodeStakedRPL(_nodeAddress) - getUint(legacyKey);
    }

    /// @notice Gets the time the the given node operator's previous unstake
    /// @param _nodeAddress The address of the node operator to query for
    function getNodeLastUnstakeTime(address _nodeAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("rpl.megapool.unstake.time", _nodeAddress)));
    }

    /// @notice Returns the timestamp at which a node last staked RPL
    /// @param _nodeAddress The address of the node operator to query for
    function getNodeRPLStakedTime(address _nodeAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("rpl.staked.node.time", _nodeAddress)));
    }

    /// @notice Returns the amount of RPL that is in the "unstaking" state
    /// @param _nodeAddress The address of the node operator to query for
    function getNodeUnstakingRPL(address _nodeAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("rpl.megapool.unstaking.amount", _nodeAddress)));
    }

    /// @notice Returns the amount of RPL that is locked for a given node
    /// @param _nodeAddress The address of the node operator to query for
    function getNodeLockedRPL(address _nodeAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("rpl.locked.node.amount", _nodeAddress)));
    }

    /// @notice Returns whether this node allows RPL locking or not
    /// @param _nodeAddress The address of the node operator to query for
    function getRPLLockingAllowed(address _nodeAddress) external view returns (bool) {
        return getBool(keccak256(abi.encodePacked("rpl.locking.allowed", _nodeAddress)));
    }

    /// @notice Sets the allow state for this node to perform functions that require locking RPL
    /// @param _nodeAddress The address of the node operator to change the state for
    /// @param _allowed Whether locking is allowed or not
    function setRPLLockingAllowed(address _nodeAddress, bool _allowed) override external onlyRPLWithdrawalAddressOrNode(_nodeAddress) {
        // Set the value
        setBool(keccak256(abi.encodePacked("rpl.locking.allowed", _nodeAddress)), _allowed);
        // Log it
        emit RPLLockingAllowed(_nodeAddress, _allowed, block.timestamp);
    }

    /// @notice Explicitly allow or remove allowance of an address to be able to stake on behalf of a node
    /// @dev The node operator is determined by the address calling this method, it is here for backwards compatibility
    /// @param _caller The address you wish to allow
    /// @param _allowed Whether the address is allowed or denied
    function setStakeRPLForAllowed(address _caller, bool _allowed) override external {
        setStakeRPLForAllowed(msg.sender, _caller, _allowed);
    }

    /// @notice Explicitly allow or remove allowance of an address to be able to stake on behalf of a node
    /// @param _nodeAddress The address of the node operator allowing the caller
    /// @param _caller The address you wish to allow
    /// @param _allowed Whether the address is allowed or denied
    function setStakeRPLForAllowed(address _nodeAddress, address _caller, bool _allowed) override public onlyRPLWithdrawalAddressOrNode(_nodeAddress) {
        // Set the value
        setBool(keccak256(abi.encodePacked("node.stake.for.allowed", _nodeAddress, _caller)), _allowed);
        // Log it
        emit StakeRPLForAllowed(_nodeAddress, _caller, _allowed, block.timestamp);
    }

    /// @notice Increases the calling node operator's megapool staked RPL by transferring RPL from msg.sender
    function stakeRPL(uint256 _amount) override external onlyRegisteredNode(msg.sender) {
        // Check caller here and skip `stakeRPLFor` to avoid unnecessary check for rocketMerkleDistributorMainnet caller
        require(callerAllowedFor(msg.sender), "Not allowed to stake for");
        _stakeRPLFor(msg.sender, _amount);
    }

    /// @notice Accept an RPL stake from any address for a specified node
    ///         Requires caller to have approved this contract to spend RPL
    ///         Requires caller to be on the node operator's allow list (see `setStakeForAllowed`)
    /// @param _nodeAddress The address of the node operator to stake on behalf of
    /// @param _amount The amount of RPL to stake
    function stakeRPLFor(address _nodeAddress, uint256 _amount) override external onlyRegisteredNode(_nodeAddress) {
        // Must be node's RPL withdrawal address if set or the node's address or an allow listed address or rocketMerkleDistributorMainnet
        if (msg.sender != getAddress(keccak256(abi.encodePacked("contract.address", "rocketMerkleDistributorMainnet")))) {
            if (!callerAllowedFor(_nodeAddress)) {
                require(getBool(keccak256(abi.encodePacked("node.stake.for.allowed", _nodeAddress, msg.sender))), "Not allowed to stake for");
            }
        }
        _stakeRPLFor(_nodeAddress, _amount);
    }

    /// @dev Internal implementation for staking process
    function _stakeRPLFor(address _nodeAddress, uint256 _amount) internal {
        transferRPLIn(msg.sender, _amount);
        increaseNodeRPLStake(_nodeAddress, _amount);
        emit RPLStaked(_nodeAddress, msg.sender, _amount, block.timestamp);
    }

    /// @notice Moves an amount of RPL from megapool staking into unstaking state
    /// @param _amount Amount of RPL to unstake
    function unstakeRPL(uint256 _amount) override external {
        unstakeRPLFor(msg.sender, _amount);
    }

    /// @notice Moves an amount of RPL from megapool staking into unstaking state
    /// @param _nodeAddress Address of node to unstake for
    /// @param _amount Amount of RPL to unstake
    function unstakeRPLFor(address _nodeAddress, uint256 _amount) override public onlyRegisteredNode(_nodeAddress) {
        require(callerAllowedFor(_nodeAddress), "Not allowed to unstake for");
        _unstakeRPLFor(_nodeAddress, _amount);
    }

    /// @dev Internal implementation for unstaking process
    function _unstakeRPLFor(address _nodeAddress, uint256 _amount) internal {
        // Withdraw any RPL that has been unstaking long enough
        _withdrawUnstakingRPL(_nodeAddress);
        // Move RPL from staking to unstaking
        decreaseNodeMegapoolRPLStake(_nodeAddress, _amount);
        addUint(keccak256(abi.encodePacked("rpl.megapool.unstaking.amount", _nodeAddress)), _amount);
        // Reset the unstake time
        setNodeLastUnstakeTime(_nodeAddress);
        // Emit event
        emit RPLUnstaked(_nodeAddress, _amount, block.timestamp);
    }

    /// @notice Withdraws any available unstaking RPL back to the node's RPL withdrawal address
    function withdrawRPL() override external {
        withdrawRPLFor(msg.sender);
    }

    /// @notice Withdraws any available unstaking RPL back to the node's RPL withdrawal address
    /// @param _nodeAddress Address of node to withdraw for
    function withdrawRPLFor(address _nodeAddress) override public onlyRegisteredNode(_nodeAddress) {
        require(callerAllowedFor(_nodeAddress), "Not allowed to withdraw for");
        _withdrawRPLFor(_nodeAddress);
    }

    /// @dev Internal implementation of withdrawal process
    function _withdrawRPLFor(address nodeAddress) internal {
        uint256 amount = _withdrawUnstakingRPL(nodeAddress);
        require(amount > 0, "No available unstaking RPL to withdraw");
        emit RPLWithdrawn(nodeAddress, amount, block.timestamp);
    }

    /// @dev Withdraws any unstaking RPL back to the node operator
    function _withdrawUnstakingRPL(address _nodeAddress) internal returns (uint256) {
        // Get contracts
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Check unstaking period condition
        uint256 lastUnstakeTime = getNodeLastUnstakeTime(_nodeAddress);
        uint256 unstakingPeriod = rocketDAOProtocolSettingsNode.getUnstakingPeriod();
        uint256 timeSinceLastUnstake = block.timestamp - lastUnstakeTime;
        if (timeSinceLastUnstake <= unstakingPeriod) {
            return 0;
        }
        // Retrieve amount of RPL in unstaking state
        bytes32 unstakingKey = keccak256(abi.encodePacked("rpl.megapool.unstaking.amount", _nodeAddress));
        uint256 amountToWithdraw = getUint(unstakingKey);
        if (amountToWithdraw == 0) {
            return 0;
        }
        // Update unstaked value
        setUint(unstakingKey, 0);
        // Perform transfer
        transferRPLOut(_nodeAddress, amountToWithdraw);
        return amountToWithdraw;
    }

    /// @dev Unstake legacy staked RPL
    /// @param _amount The amount of RPL to withdraw
    function unstakeLegacyRPL(uint256 _amount) override external {
        unstakeLegacyRPLFor(msg.sender, _amount);
    }

    /// @dev Unstake legacy RPL for a given node operator
    /// @param _nodeAddress Address of the node operator to withdraw legacy RPL for
    /// @param _amount The amount of RPL to withdraw
    function unstakeLegacyRPLFor(address _nodeAddress, uint256 _amount) override public onlyRegisteredNode(_nodeAddress) {
        require(callerAllowedFor(_nodeAddress), "Not allowed to unstake legacy RPL for");
        _unstakeLegacyRPL(_nodeAddress, _amount);
    }

    /// @dev Internal implementation for legacy unstake process
    function _unstakeLegacyRPL(address _nodeAddress, uint256 _amount) internal {
        // Withdraw any RPL that has been unstaking long enough
        _withdrawUnstakingRPL(_nodeAddress);
        // Move RPL from staking to unstaking
        decreaseNodeLegacyRPLStake(_nodeAddress, _amount);
        addUint(keccak256(abi.encodePacked("rpl.megapool.unstaking.amount", _nodeAddress)), _amount);
        // Reset the unstake time
        setNodeLastUnstakeTime(_nodeAddress);
        // Emit event
        emit RPLLegacyUnstaked(_nodeAddress, _amount, block.timestamp);
    }

    /// @notice Locks an amount of RPL from being withdrawn even if the node operator is over capitalised
    /// @param _nodeAddress The address of the node operator
    /// @param _amount The amount of RPL to lock
    function lockRPL(address _nodeAddress, uint256 _amount) override external onlyLatestNetworkContract() {
        // Check status
        require(getBool(keccak256(abi.encodePacked("rpl.locking.allowed", _nodeAddress))), "Node is not allowed to lock RPL");
        // The node must have unlocked stake equaling or greater than the amount
        uint256 rplStake = getNodeStakedRPL(_nodeAddress);
        bytes32 lockedStakeKey = keccak256(abi.encodePacked("rpl.locked.node.amount", _nodeAddress));
        uint256 lockedRPL = getUint(lockedStakeKey);
        require(rplStake - lockedRPL >= _amount, "Not enough staked RPL");
        // Increase locked RPL
        setUint(lockedStakeKey, lockedRPL + _amount);
        // Emit event
        emit RPLLocked(_nodeAddress, _amount, block.timestamp);
    }

    /// @notice Unlocks an amount of RPL making it possible to withdraw if the nod is over capitalised
    /// @param _nodeAddress The address of the node operator
    /// @param _amount The amount of RPL to unlock
    function unlockRPL(address _nodeAddress, uint256 _amount) override external onlyLatestNetworkContract() {
        // The node must have locked stake equaling or greater than the amount
        bytes32 lockedStakeKey = keccak256(abi.encodePacked("rpl.locked.node.amount", _nodeAddress));
        uint256 lockedRPL = getUint(lockedStakeKey);
        require(_amount <= lockedRPL, "Not enough locked RPL");
        // Decrease locked RPL
        setUint(lockedStakeKey, lockedRPL - _amount);
        // Emit event
        emit RPLUnlocked(_nodeAddress, _amount, block.timestamp);
    }

    /// @notice Transfers RPL from one node to another
    /// @param _from The node to transfer from
    /// @param _to The node to transfer to
    /// @param _amount The amount of RPL to transfer
    function transferRPL(address _from, address _to, uint256 _amount) override external onlyLatestNetworkContract() onlyRegisteredNode(_from) {
        // Check sender has enough RPL
        require(getNodeStakedRPL(_from) >= _amount, "Sender has insufficient RPL");
        // Transfer the stake
        decreaseNodeRPLStake(_from, _amount);
        increaseNodeRPLStake(_to, _amount);
        // Emit event
        emit RPLTransferred(_from, _to, _amount, block.timestamp);
    }

    /// @notice Burns an amount of RPL staked by a given node operator
    /// @param _from The node to burn from
    /// @param _amount The amount of RPL to burn
    function burnRPL(address _from, uint256 _amount) override external onlyLatestNetworkContract() onlyRegisteredNode(_from) {
        // Check sender has enough RPL
        require(getNodeStakedRPL(_from) >= _amount, "Node has insufficient RPL");
        // Decrease the stake amount
        decreaseNodeRPLStake(_from, _amount);
        // Withdraw the RPL to this contract
        rocketVault.withdrawToken(address(this), rplToken, _amount);
        // Execute the token burn
        IERC20Burnable(address(rplToken)).burn(_amount);
        // Emit event
        emit RPLBurned(_from, _amount, block.timestamp);
    }

    /// @notice Slash a node's legacy RPL by an ETH amount
    ///         Only accepts calls from registered minipools
    /// @param _nodeAddress The address to slash RPL from
    /// @param _ethSlashAmount The amount of RPL to slash denominated in ETH value
    function slashRPL(address _nodeAddress, uint256 _ethSlashAmount) override external onlyRegisteredMinipool(msg.sender) {
        // Load contracts
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        // Calculate RPL amount to slash
        uint256 rplSlashAmount = calcBase * _ethSlashAmount / rocketNetworkPrices.getRPLPrice();
        // Cap slashed amount to node's RPL stake
        uint256 rplStake = getNodeLegacyStakedRPL(_nodeAddress);
        if (rplSlashAmount > rplStake) { rplSlashAmount = rplStake; }
        // Transfer slashed amount to auction contract
        if(rplSlashAmount > 0) rocketVault.transferToken("rocketAuctionManager", IERC20(getContractAddress("rocketTokenRPL")), rplSlashAmount);
        // Update RPL stake amounts
        decreaseNodeLegacyRPLStake(_nodeAddress, rplSlashAmount);
        // Mark minipool as slashed
        setBool(keccak256(abi.encodePacked("minipool.rpl.slashed", msg.sender)), true);
        // Emit RPL slashed event
        emit RPLSlashed(_nodeAddress, rplSlashAmount, _ethSlashAmount, block.timestamp);
    }

    /// @dev Increases a node operator's megapool staked RPL amount
    /// @param _amount How much to increase staked RPL by
    function increaseNodeRPLStake(address _nodeAddress, uint256 _amount) private {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        bytes32 key = keccak256(abi.encodePacked("rpl.staked.node.amount", _nodeAddress));
        (,, uint224 value) = rocketNetworkSnapshots.latest(key);
        migrateLegacy(_nodeAddress, uint256(value));
        rocketNetworkSnapshots.push(key, value + uint224(_amount));
        // Increase total
        addUint(totalKey, _amount);
        addUint(totalMegapoolKey, _amount);
    }

    /// @dev Decreases a node operator's staked RPL, first taking from their legacy than their megapool staked RPL
    ///      Does not check conditions for minimum stake requirements
    function decreaseNodeRPLStake(address _nodeAddress, uint256 _amount) private {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        bytes32 key = keccak256(abi.encodePacked("rpl.staked.node.amount", _nodeAddress));
        (,, uint224 totalStakedRPL) = rocketNetworkSnapshots.latest(key);
        migrateLegacy(_nodeAddress, uint256(totalStakedRPL));
        // Take from megapool amount if not enough legacy
        uint256 legacyStakedRPL = getNodeLegacyStakedRPL(_nodeAddress);
        uint256 legacyAmount = _amount;
        if (legacyAmount > legacyStakedRPL) {
            uint256 megapoolAmount = legacyAmount - legacyStakedRPL;
            legacyAmount -= megapoolAmount;
            // Decrease megapool total
            subUint(totalMegapoolKey, megapoolAmount);
        }
        // Store new values
        if (legacyAmount > 0) {
            bytes32 legacyKey = keccak256(abi.encodePacked("rpl.legacy.staked.node.amount", _nodeAddress));
            subUint(legacyKey, legacyAmount);
        }
        rocketNetworkSnapshots.push(key, totalStakedRPL - uint224(_amount));
        // Decrease total
        subUint(totalKey, _amount);
    }

    /// @dev Decreases a node operator's megapool staked RPL amount
    /// @param _amount Amount to decrease by
    function decreaseNodeMegapoolRPLStake(address _nodeAddress, uint256 _amount) private {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        bytes32 key = keccak256(abi.encodePacked("rpl.staked.node.amount", _nodeAddress));
        (,, uint224 totalStakedRPL) = rocketNetworkSnapshots.latest(key);
        migrateLegacy(_nodeAddress, uint256(totalStakedRPL));
        // Check node operator has sufficient RPL to reduce
        uint256 legacyStakedRPL = getNodeLegacyStakedRPL(_nodeAddress);
        uint256 lockedRPL = getNodeLockedRPL(_nodeAddress);
        require (
            uint256(totalStakedRPL) >= _amount + lockedRPL &&
            uint256(totalStakedRPL) >= _amount + legacyStakedRPL,
            "Insufficient RPL stake to reduce"
        );
        // Store new value
        rocketNetworkSnapshots.push(key, totalStakedRPL - uint224(_amount));
        // Decrease totals
        subUint(totalKey, _amount);
        subUint(totalMegapoolKey, _amount);
    }

    /// @dev Decreases a node operator's legacy staked RPL amount
    /// @param _amount Amount to decrease by
    function decreaseNodeLegacyRPLStake(address _nodeAddress, uint256 _amount) private {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        bytes32 key = keccak256(abi.encodePacked("rpl.staked.node.amount", _nodeAddress));
        (,, uint224 totalStakedRPL) = rocketNetworkSnapshots.latest(key);
        migrateLegacy(_nodeAddress, uint256(totalStakedRPL));
        // Check amount does not exceed amount staked
        bytes32 legacyKey = keccak256(abi.encodePacked("rpl.legacy.staked.node.amount", _nodeAddress));
        uint256 legacyStakedRPL = getUint(legacyKey);
        // Check amount after decrease does not fall below minimum requirement for minipool bond
        uint256 maximumStakedRPL = getNodeMaximumRPLStakeForMinipools(_nodeAddress);
        require (
            legacyStakedRPL >= _amount + maximumStakedRPL,
            "Insufficient legacy staked RPL"
        );
        uint256 lockedRPL = getNodeLockedRPL(_nodeAddress);
        // Check node has enough unlocked RPL for the reduction
        require (
            uint256(totalStakedRPL) >= _amount + lockedRPL,
            "Insufficient RPL stake to reduce"
        );
        // Store new values
        rocketNetworkSnapshots.push(key, totalStakedRPL - uint224(_amount));
        subUint(legacyKey, _amount);
        // Decrease total
        subUint(totalKey, _amount);
    }

    /// @notice Returns the total amount of a node operator's bonded ETH (minipool + megapool)
    /// @param _nodeAddress Address of the node operator to query
    function getNodeETHBonded(address _nodeAddress) public view returns (uint256) {
        return getNodeMegapoolETHBonded(_nodeAddress) + getNodeMinipoolETHBonded(_nodeAddress);
    }

    /// @notice Returns the amount of a node operator's megapool bonded ETH
    /// @param _nodeAddress Address of the node operator to query
    function getNodeMegapoolETHBonded(address _nodeAddress) public view returns (uint256) {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        bytes32 key = keccak256(abi.encodePacked("megapool.eth.provided.node.amount", _nodeAddress));
        (, , uint224 value) = rocketNetworkSnapshots.latest(key);
        return uint256(value);
    }

    /// @notice Returns the amount of a node operator's minipool bonded ETH
    /// @param _nodeAddress Address of the node operator to query
    function getNodeMinipoolETHBonded(address _nodeAddress) public view returns (uint256) {
        // Get contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        uint256 activeMinipoolCount = rocketMinipoolManager.getNodeActiveMinipoolCount(_nodeAddress);
        // Retrieve stored ETH borrowed value
        uint256 ethBorrowed = getNodeMinipoolETHBorrowed(_nodeAddress);
        // ETH bonded is number of staking minipools * 32 - eth borrowed
        uint256 totalEthStaked = activeMinipoolCount * 32 ether;
        return totalEthStaked - ethBorrowed;
    }

    /// @notice Returns a node's borrowed ETH amount
    /// @param _nodeAddress The address of the node operator to query
    function getNodeMegapoolETHBorrowed(address _nodeAddress) public view returns (uint256) {
        bytes32 key = keccak256(abi.encodePacked("megapool.eth.matched.node.amount", _nodeAddress));
        return getUint(key);
    }

    /// @notice Returns a node's borrowed ETH amount
    /// @param _nodeAddress The address of the node operator to query
    function getNodeMinipoolETHBorrowed(address _nodeAddress) public view returns (uint256) {
        RocketNetworkSnapshotsInterface rocketNetworkSnapshots = RocketNetworkSnapshotsInterface(getContractAddress("rocketNetworkSnapshots"));
        bytes32 key = keccak256(abi.encodePacked("eth.matched.node.amount", _nodeAddress));
        (,,uint224 value) = rocketNetworkSnapshots.latest(key);
        return value;
    }

    /// @notice Returns a node's total borrowed ETH amount (minipool + megapool)
    /// @param _nodeAddress The address of the node operator to query
    function getNodeETHBorrowed(address _nodeAddress) public view returns (uint256) {
        return getNodeMegapoolETHBorrowed(_nodeAddress) + getNodeMinipoolETHBorrowed(_nodeAddress);
    }

    /// @notice Returns the ratio between capital taken from users and bonded by a node operator for minipools
    ///         The value is a 1e18 precision fixed point integer value of (node capital + user capital) / node capital.
    /// @param _nodeAddress The address of the node operator to query
    /// @dev Inconsistent naming for backwards compatibility
    function getNodeETHCollateralisationRatio(address _nodeAddress) public view returns (uint256) {
        uint256 borrowedETH = getNodeMinipoolETHBorrowed(_nodeAddress);
        uint256 bondedETH = getNodeMinipoolETHBonded(_nodeAddress);
        if (borrowedETH == 0 || bondedETH == 0) {
            return calcBase * 2;
        }
        uint256 ethTotal = borrowedETH + bondedETH;
        return (ethTotal * calcBase) / (ethTotal - borrowedETH);
    }

    /// @notice Returns a node's maximum RPL stake to fully collateralise their minipools
    /// @param _nodeAddress The address of the node operator to calculate for
    function getNodeMaximumRPLStakeForMinipools(address _nodeAddress) public view returns (uint256) {
        // Load contracts
        RocketNetworkPricesInterface rocketNetworkPrices = RocketNetworkPricesInterface(getContractAddress("rocketNetworkPrices"));
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Retrieve variables
        uint256 maximumStakePercent = rocketDAOProtocolSettingsNode.getMaximumPerMinipoolStake();
        uint256 bondedETH = getNodeMinipoolETHBonded(_nodeAddress);
        return bondedETH * maximumStakePercent / rocketNetworkPrices.getRPLPrice();
    }

    /// @dev If legacy RPL balance has not been migrated, migrate it. Otherwise, do nothing
    function migrateLegacy(address _nodeAddress, uint256 _amount) private {
        bytes32 migratedKey = keccak256(abi.encodePacked("rpl.legacy.staked.node.migrated", _nodeAddress));
        if (getBool(migratedKey) ) {
            return;
        }
        bytes32 legacyKey = keccak256(abi.encodePacked("rpl.legacy.staked.node.amount", _nodeAddress));
        setUint(legacyKey, _amount);
        setBool(migratedKey, true);
    }

    /// @dev Transfers RPL out of vault into node's withdrawal address
    function transferRPLOut(address _nodeAddress, uint256 _amount) internal {
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        address rplWithdrawalAddress = rocketNodeManager.getNodeRPLWithdrawalAddress(_nodeAddress);
        rocketVault.withdrawToken(rplWithdrawalAddress, IERC20(getContractAddress("rocketTokenRPL")), _amount);
    }

    /// @dev Transfers RPL from msg.sender into vault
    function transferRPLIn(address _nodeAddress, uint256 _amount) internal {
        // Transfer RPL tokens
        require(rplToken.transferFrom(_nodeAddress, address(this), _amount), "Could not transfer RPL to staking contract");
        // Deposit RPL tokens to vault
        require(rplToken.approve(address(rocketVault), _amount), "Could not approve vault RPL deposit");
        rocketVault.depositToken("rocketNodeStaking", rplToken, _amount);
    }

    /// @dev Sets the time of the given node operator's unstake to the current block time
    function setNodeLastUnstakeTime(address _nodeAddress) internal {
        setUint(keccak256(abi.encodePacked("rpl.megapool.unstake.time", _nodeAddress)), block.timestamp);
    }

    /// @dev Implements caller restrictions (per RPIP-31):
    ///         - If a node’s RPL withdrawal address is unset, the call MUST come from one of: the node’s primary withdrawal address, or the node’s address
    ///         - If a node’s RPL withdrawal address is set, the call MUST come from the current RPL withdrawal address
    function callerAllowedFor(address _nodeAddress) internal view returns (bool) {
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        if (rocketNodeManager.getNodeRPLWithdrawalAddressIsSet(_nodeAddress)) {
            address rplWithdrawalAddress = rocketNodeManager.getNodeRPLWithdrawalAddress(_nodeAddress);
            return msg.sender == rplWithdrawalAddress;
        } else {
            address withdrawalAddress = rocketStorage.getNodeWithdrawalAddress(_nodeAddress);
            return (msg.sender == _nodeAddress) || (msg.sender == withdrawalAddress);
        }
    }
}