// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.18;

import "../RocketBase.sol";
import "../../interface/deposit/RocketDepositPoolInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/minipool/RocketMinipoolQueueInterface.sol";
import "../../interface/network/RocketNetworkFeesInterface.sol";
import "../../interface/node/RocketNodeDepositInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsDepositInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNetworkInterface.sol";
import "../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import "../../interface/dao/node/settings/RocketDAONodeTrustedSettingsMembersInterface.sol";
import "../../types/MinipoolDeposit.sol";
import "../../interface/node/RocketNodeManagerInterface.sol";
import "../../interface/RocketVaultInterface.sol";
import "../../interface/node/RocketNodeStakingInterface.sol";
import "../network/RocketNetworkSnapshots.sol";
import "../../interface/RocketVaultWithdrawerInterface.sol";

/// @notice Handles node deposits and minipool creation
contract RocketNodeDeposit is RocketBase, RocketNodeDepositInterface, RocketVaultWithdrawerInterface {

    // Events
    event DepositReceived(address indexed from, uint256 amount, uint256 time);
    event DepositFor(address indexed nodeAddress, address indexed from, uint256 amount, uint256 time);
    event Withdrawal(address indexed nodeAddress, address indexed to, uint256 amount, uint256 time);

    function receiveVaultWithdrawalETH() external payable {}

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 4;
    }

    /// @dev Accept incoming ETH from the deposit pool
    receive() external payable onlyLatestContract("rocketDepositPool", msg.sender) {}

    /// @notice Returns a node operator's credit balance in wei
    function getNodeDepositCredit(address _nodeOperator) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("node.deposit.credit.balance", _nodeOperator)));
    }

    /// @notice Returns the current ETH balance for the given node operator
    function getNodeEthBalance(address _nodeAddress) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("node.eth.balance", _nodeAddress)));
    }

    /// @notice Returns the sum of the credit balance of a given node operator and their balance
    function getNodeCreditAndBalance(address _nodeAddress) override external view returns (uint256) {
        return getNodeDepositCredit(_nodeAddress) + getNodeEthBalance(_nodeAddress);
    }

    /// @notice Returns the sum of the amount of ETH credit currently usable by a given node operator and their balance
    function getNodeUsableCreditAndBalance(address _nodeAddress) override external view returns (uint256) {
        return getNodeUsableCredit(_nodeAddress) + getNodeEthBalance(_nodeAddress);
    }

    /// @notice Returns the amount of ETH credit currently usable by a given node operator
    function getNodeUsableCredit(address _nodeAddress) override public view returns (uint256) {
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        uint256 depositPoolBalance = rocketDepositPool.getBalance();
        uint256 usableCredit = getNodeDepositCredit(_nodeAddress);
        if (usableCredit > depositPoolBalance) {
            usableCredit = depositPoolBalance;
        }
        return usableCredit;
    }

    /// @dev Increases a node operators deposit credit balance
    function increaseDepositCreditBalance(address _nodeAddress, uint256 _amount) override external onlyLatestContract("rocketNodeDeposit", address(this)) onlyRegisteredNode(_nodeAddress) {
        // Accept calls from network contracts or registered minipools
        require(getBool(keccak256(abi.encodePacked("minipool.exists", msg.sender))) ||
            getBool(keccak256(abi.encodePacked("contract.exists", msg.sender))),
            "Invalid or outdated network contract");
        // Increase credit balance
        addUint(keccak256(abi.encodePacked("node.deposit.credit.balance", _nodeAddress)), _amount);
    }

    /// @notice Deposits ETH for the given node operator
    /// @param _nodeAddress The address of the node operator to deposit ETH for
    function depositEthFor(address _nodeAddress) override external payable onlyLatestContract("rocketNodeDeposit", address(this)) onlyRegisteredNode(_nodeAddress) {
        // Sanity check caller is not node itself
        require(msg.sender != _nodeAddress, "Cannot deposit ETH for self");
        // Send the ETH to vault
        uint256 amount = msg.value;
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        rocketVault.depositEther{value: amount}();
        // Increment balance
        addUint(keccak256(abi.encodePacked("node.eth.balance", _nodeAddress)), amount);
        // Log it
        emit DepositFor(_nodeAddress, msg.sender, amount, block.timestamp);
    }

    /// @notice Withdraws ETH from a node operator's balance. Must be called from withdrawal address.
    /// @param _nodeAddress Address of the node operator to withdraw from
    /// @param _amount Amount of ETH to withdraw
    function withdrawEth(address _nodeAddress, uint256 _amount) external onlyLatestContract("rocketNodeDeposit", address(this)) onlyRegisteredNode(_nodeAddress) {
        // Check valid caller
        address withdrawalAddress = rocketStorage.getNodeWithdrawalAddress(_nodeAddress);
        require(msg.sender == withdrawalAddress, "Only withdrawal address can withdraw ETH");
        // Check balance and update
        uint256 balance = getNodeEthBalance(_nodeAddress);
        require(balance >= _amount, "Insufficient balance");
        setUint(keccak256(abi.encodePacked("node.eth.balance", _nodeAddress)), balance - _amount);
        // Withdraw the funds
        RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
        rocketVault.withdrawEther(_amount);
        // Send funds to withdrawalAddress
        (bool success, ) = withdrawalAddress.call{value: _amount}("");
        require(success, "Failed to withdraw ETH");
        // Log it
        emit Withdrawal(_nodeAddress, withdrawalAddress, _amount, block.timestamp);
    }

    /// @notice Accept a node deposit and create a new minipool under the node. Only accepts calls from registered nodes
    /// @param _bondAmount The amount of capital the node operator wants to put up as his bond
    /// @param _minimumNodeFee Transaction will revert if network commission rate drops below this amount
    /// @param _validatorPubkey Pubkey of the validator the node operator wishes to migrate
    /// @param _validatorSignature Signature from the validator over the deposit data
    /// @param _depositDataRoot The hash tree root of the deposit data (passed onto the deposit contract on pre stake)
    /// @param _salt Salt used to deterministically construct the minipool's address
    /// @param _expectedMinipoolAddress The expected deterministic minipool address. Will revert if it doesn't match
    function deposit(uint256 _bondAmount, uint256 _minimumNodeFee, bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot, uint256 _salt, address _expectedMinipoolAddress) override external payable onlyLatestContract("rocketNodeDeposit", address(this)) onlyRegisteredNode(msg.sender) {
        // Check amount
        require(msg.value == _bondAmount, "Invalid value");
        // Process the deposit
        _deposit(_bondAmount, _minimumNodeFee, _validatorPubkey, _validatorSignature, _depositDataRoot, _salt, _expectedMinipoolAddress);
    }

    /// @notice Accept a node deposit and create a new minipool under the node. Uses node's credit balance to cover
    ///         shortfall in value provided to cover bond. Only accepts calls from registered nodes
    /// @param _bondAmount The amount of capital the node operator wants to put up as his bond
    /// @param _minimumNodeFee Transaction will revert if network commission rate drops below this amount
    /// @param _validatorPubkey Pubkey of the validator the node operator wishes to migrate
    /// @param _validatorSignature Signature from the validator over the deposit data
    /// @param _depositDataRoot The hash tree root of the deposit data (passed onto the deposit contract on pre stake)
    /// @param _salt Salt used to deterministically construct the minipool's address
    /// @param _expectedMinipoolAddress The expected deterministic minipool address. Will revert if it doesn't match
    function depositWithCredit(uint256 _bondAmount, uint256 _minimumNodeFee, bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot, uint256 _salt, address _expectedMinipoolAddress) override external payable onlyLatestContract("rocketNodeDeposit", address(this)) onlyRegisteredNode(msg.sender) {
        // Sanity check
        require(msg.value <= _bondAmount, "Excessive value for requested bond");
        {
            uint256 balanceToUse = 0;
            uint256 creditToUse = 0;
            uint256 shortFall = _bondAmount - msg.value;
            uint256 credit = getNodeUsableCredit(msg.sender);
            uint256 balance = getNodeEthBalance(msg.sender);
            // Check credit
            require (credit + balance >= shortFall, "Insufficient credit");
            // Calculate amounts to use
            creditToUse = shortFall;
            if (credit < shortFall) {
                balanceToUse = shortFall - credit;
                creditToUse = credit;
            }
            // Update balances
            if (balanceToUse > 0) {
                subUint(keccak256(abi.encodePacked("node.eth.balance", msg.sender)), balanceToUse);
                // Withdraw the funds
                RocketVaultInterface rocketVault = RocketVaultInterface(getContractAddress("rocketVault"));
                rocketVault.withdrawEther(balanceToUse);
            }
            if (creditToUse > 0) {
                subUint(keccak256(abi.encodePacked("node.deposit.credit.balance", msg.sender)), creditToUse);
            }
        }
        // Process the deposit
        _deposit(_bondAmount, _minimumNodeFee, _validatorPubkey, _validatorSignature, _depositDataRoot, _salt, _expectedMinipoolAddress);
    }

    /// @notice Returns true if the given amount is a valid deposit amount
    function isValidDepositAmount(uint256 _amount) override public pure returns (bool) {
        return _amount == 16 ether || _amount == 8 ether;
    }

    /// @notice Returns an array of valid deposit amounts
    function getDepositAmounts() override external pure returns (uint256[] memory) {
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 16 ether;
        amounts[1] = 8 ether;
        return amounts;
    }

    /// @dev Internal logic to process a deposit
    function _deposit(uint256 _bondAmount, uint256 _minimumNodeFee, bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot, uint256 _salt, address _expectedMinipoolAddress) private {
        // Check pre-conditions
        checkDepositsEnabled();
        checkDistributorInitialised();
        checkNodeFee(_minimumNodeFee);
        require(isValidDepositAmount(_bondAmount), "Invalid deposit amount");
        // Get launch constants
        uint256 launchAmount;
        uint256 preLaunchValue;
        {
            RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
            launchAmount = rocketDAOProtocolSettingsMinipool.getLaunchBalance();
            preLaunchValue = rocketDAOProtocolSettingsMinipool.getPreLaunchValue();
        }
        // Emit deposit received event
        emit DepositReceived(msg.sender, msg.value, block.timestamp);
        // Increase ETH matched (used to calculate RPL collateral requirements)
        _increaseEthMatched(msg.sender, launchAmount - _bondAmount);
        // Create the minipool
        RocketMinipoolInterface minipool = createMinipool(_salt, _expectedMinipoolAddress);
        // Process node deposit
        _processNodeDeposit(preLaunchValue, _bondAmount);
        // Perform the pre deposit
        minipool.preDeposit{value: preLaunchValue}(_bondAmount, _validatorPubkey, _validatorSignature, _depositDataRoot);
        // Enqueue the minipool
        enqueueMinipool(address(minipool));
        // Assign deposits if enabled
        assignDeposits();
    }

    /// @dev Processes a node deposit with the deposit pool. If user has not supplied full bond amount with the transaction
    ///      the shortfall will be taken from their credit. Any excess ETH after prelaunch value is sent to minipool is
    //       then deposited into the deposit pool
    /// @param _preLaunchValue The prelaunch value (result of call to `RocketDAOProtocolSettingsMinipool.getPreLaunchValue()`
    /// @param _bondAmount The bond amount for this deposit
    function _processNodeDeposit(uint256 _preLaunchValue, uint256 _bondAmount) private {
        // Get contracts
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        // Retrieve ETH from deposit pool if required
        uint256 shortFall = 0;
        if (address(this).balance < _preLaunchValue) {
            shortFall = _preLaunchValue - address(this).balance;
            rocketDepositPool.nodeCreditWithdrawal(shortFall);
        }
        uint256 remaining = address(this).balance - _preLaunchValue;
        // Deposit the left over value into the deposit pool
        rocketDepositPool.nodeDeposit{value: remaining}(_bondAmount - _preLaunchValue);
    }

    /// @notice Creates a "vacant" minipool which a node operator can use to migrate a validator with a BLS withdrawal credential
    /// @param _bondAmount The amount of capital the node operator wants to put up as his bond
    /// @param _minimumNodeFee Transaction will revert if network commission rate drops below this amount
    /// @param _validatorPubkey Pubkey of the validator the node operator wishes to migrate
    /// @param _salt Salt used to deterministically construct the minipool's address
    /// @param _expectedMinipoolAddress The expected deterministic minipool address. Will revert if it doesn't match
    /// @param _currentBalance The current balance of the validator on the beaconchain (will be checked by oDAO and scrubbed if not correct)
    function createVacantMinipool(uint256 _bondAmount, uint256 _minimumNodeFee, bytes calldata _validatorPubkey, uint256 _salt, address _expectedMinipoolAddress, uint256 _currentBalance) override external onlyLatestContract("rocketNodeDeposit", address(this)) onlyRegisteredNode(msg.sender) {
        // Check pre-conditions
        checkVacantMinipoolsEnabled();
        checkDistributorInitialised();
        checkNodeFee(_minimumNodeFee);
        require(isValidDepositAmount(_bondAmount), "Invalid deposit amount");
        // Increase ETH matched (used to calculate RPL collateral requirements)
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        uint256 launchAmount = rocketDAOProtocolSettingsMinipool.getLaunchBalance();
        _increaseEthMatched(msg.sender, launchAmount - _bondAmount);
        // Create the minipool
        _createVacantMinipool(_salt, _validatorPubkey, _bondAmount, _expectedMinipoolAddress, _currentBalance);
    }

    /// @notice Called by minipools during bond reduction to increase the amount of ETH the node operator has
    /// @param _nodeAddress The node operator's address to increase the ETH matched for
    /// @param _amount The amount to increase the ETH matched
    /// @dev Will revert if the new ETH matched amount exceeds the node operators limit
    function increaseEthMatched(address _nodeAddress, uint256 _amount) override external onlyLatestContract("rocketNodeDeposit", address(this)) onlyLatestNetworkContract() {
        // Try to distribute any existing rewards at the previous collateral rate
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        rocketMinipoolManager.tryDistribute(_nodeAddress);
        // Increase ETH matched
        _increaseEthMatched(_nodeAddress, _amount);
    }

    /// @dev Increases the amount of ETH that has been matched against a node operators bond. Reverts if it exceeds the
    ///      collateralisation requirements of the network
    function _increaseEthMatched(address _nodeAddress, uint256 _amount) private {
        // Check amount doesn't exceed limits
        RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
        RocketNetworkSnapshots rocketNetworkSnapshots = RocketNetworkSnapshots(getContractAddress("rocketNetworkSnapshots"));
        uint256 ethMatched = rocketNodeStaking.getNodeETHMatched(_nodeAddress) + _amount;
        require(
            ethMatched <= rocketNodeStaking.getNodeETHMatchedLimit(_nodeAddress),
            "ETH matched after deposit exceeds limit based on node RPL stake"
        );
        // Push the change to snapshot manager
        bytes32 key = keccak256(abi.encodePacked("eth.matched.node.amount", _nodeAddress));
        rocketNetworkSnapshots.push(key, uint32(block.number), uint224(ethMatched));
    }

    /// @dev Adds a minipool to the queue
    function enqueueMinipool(address _minipoolAddress) private {
        // Add minipool to queue
        RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue")).enqueueMinipool(_minipoolAddress);
    }

    /// @dev Reverts if node operator has not initialised their fee distributor
    function checkDistributorInitialised() private view {
        // Check node has initialised their fee distributor
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        require(rocketNodeManager.getFeeDistributorInitialised(msg.sender), "Fee distributor not initialised");
    }

    /// @dev Creates a minipool and returns an instance of it
    /// @param _salt The salt used to determine the minipools address
    /// @param _expectedMinipoolAddress The expected minipool address. Reverts if not correct
    function createMinipool(uint256 _salt, address _expectedMinipoolAddress) private returns (RocketMinipoolInterface) {
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        // Check minipool doesn't exist or previously exist
        require(!rocketMinipoolManager.getMinipoolExists(_expectedMinipoolAddress) && !rocketMinipoolManager.getMinipoolDestroyed(_expectedMinipoolAddress), "Minipool already exists or was previously destroyed");
        // Create minipool
        RocketMinipoolInterface minipool = rocketMinipoolManager.createMinipool(msg.sender, _salt);
        // Ensure minipool address matches expected
        require(address(minipool) == _expectedMinipoolAddress, "Unexpected minipool address");
        // Return
        return minipool;
    }

    /// @dev Creates a vacant minipool and returns an instance of it
    /// @param _salt The salt used to determine the minipools address
    /// @param _validatorPubkey Pubkey of the validator owning this minipool
    /// @param _bondAmount ETH value the node operator is putting up as capital for this minipool
    /// @param _expectedMinipoolAddress The expected minipool address. Reverts if not correct
    /// @param _currentBalance The current balance of the validator on the beaconchain (will be checked by oDAO and scrubbed if not correct)
    function _createVacantMinipool(uint256 _salt, bytes calldata _validatorPubkey, uint256 _bondAmount, address _expectedMinipoolAddress, uint256 _currentBalance) private returns (RocketMinipoolInterface) {
        // Load contracts
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        // Check minipool doesn't exist or previously exist
        require(!rocketMinipoolManager.getMinipoolExists(_expectedMinipoolAddress) && !rocketMinipoolManager.getMinipoolDestroyed(_expectedMinipoolAddress), "Minipool already exists or was previously destroyed");
        // Create minipool
        RocketMinipoolInterface minipool = rocketMinipoolManager.createVacantMinipool(msg.sender, _salt, _validatorPubkey, _bondAmount, _currentBalance);
        // Ensure minipool address matches expected
        require(address(minipool) == _expectedMinipoolAddress, "Unexpected minipool address");
        // Return
        return minipool;
    }

    /// @dev Reverts if network node fee is below a minimum
    /// @param _minimumNodeFee The minimum node fee required to not revert
    function checkNodeFee(uint256 _minimumNodeFee) private view {
        // Load contracts
        RocketNetworkFeesInterface rocketNetworkFees = RocketNetworkFeesInterface(getContractAddress("rocketNetworkFees"));
        // Check current node fee
        uint256 nodeFee = rocketNetworkFees.getNodeFee();
        require(nodeFee >= _minimumNodeFee, "Minimum node fee exceeds current network node fee");
    }

    /// @dev Reverts if deposits are not enabled
    function checkDepositsEnabled() private view {
        // Get contracts
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Check node settings
        require(rocketDAOProtocolSettingsNode.getDepositEnabled(), "Node deposits are currently disabled");
    }

    /// @dev Reverts if vacant minipools are not enabled
    function checkVacantMinipoolsEnabled() private view {
        // Get contracts
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Check node settings
        require(rocketDAOProtocolSettingsNode.getVacantMinipoolsEnabled(), "Vacant minipools are currently disabled");
    }

    /// @dev Executes an assignDeposits call on the deposit pool
    function assignDeposits() private {
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        rocketDepositPool.maybeAssignDeposits();
    }
}
