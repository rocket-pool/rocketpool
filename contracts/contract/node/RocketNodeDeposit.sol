// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";

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

/// @notice Handles node deposits and minipool creation
contract RocketNodeDeposit is RocketBase, RocketNodeDepositInterface {

    // Libs
    using SafeMath for uint;

    // Events
    event DepositReceived(address indexed from, uint256 amount, uint256 time);

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 3;
    }

    /// @dev Accept incoming ETH from the deposit pool
    receive() external payable onlyLatestContract("rocketDepositPool", msg.sender) {}

    /// @notice Returns a node operator's credit balance in wei
    function getNodeDepositCredit(address _nodeOperator) override public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("node.deposit.credit.balance", _nodeOperator)));
    }

    /// @dev Increases a node operators deposit credit balance
    function increaseDepositCreditBalance(address _nodeOperator, uint256 _amount) override external onlyLatestContract("rocketNodeDeposit", address(this)) {
        // Accept calls from network contracts or registered minipools
        require(getBool(keccak256(abi.encodePacked("minipool.exists", msg.sender))) ||
            getBool(keccak256(abi.encodePacked("contract.exists", msg.sender))),
            "Invalid or outdated network contract");
        // Increase credit balance
        addUint(keccak256(abi.encodePacked("node.deposit.credit.balance", _nodeOperator)), _amount);
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

    /// @notice Accept a node deposit and create a new minipool under the node. Only accepts calls from registered nodes
    /// @param _bondAmount The amount of capital the node operator wants to put up as his bond
    /// @param _minimumNodeFee Transaction will revert if network commission rate drops below this amount
    /// @param _validatorPubkey Pubkey of the validator the node operator wishes to migrate
    /// @param _validatorSignature Signature from the validator over the deposit data
    /// @param _depositDataRoot The hash tree root of the deposit data (passed onto the deposit contract on pre stake)
    /// @param _salt Salt used to deterministically construct the minipool's address
    /// @param _expectedMinipoolAddress The expected deterministic minipool address. Will revert if it doesn't match
    function depositWithCredit(uint256 _bondAmount, uint256 _minimumNodeFee, bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot, uint256 _salt, address _expectedMinipoolAddress) override external payable onlyLatestContract("rocketNodeDeposit", address(this)) onlyRegisteredNode(msg.sender) {
        // Query node's deposit credit
        uint256 credit = getNodeDepositCredit(msg.sender);
        // Credit balance accounting
        if (credit < _bondAmount) {
            uint256 shortFall = _bondAmount.sub(credit);
            require(msg.value == shortFall, "Invalid value");
            setUint(keccak256(abi.encodePacked("node.deposit.credit.balance", msg.sender)), 0);
        } else {
            require(msg.value == 0, "Invalid value");
            subUint(keccak256(abi.encodePacked("node.deposit.credit.balance", msg.sender)), _bondAmount);
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
        // Check that pre deposit won't fail
        if (msg.value < preLaunchValue) {
            RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
            require(preLaunchValue.sub(msg.value) <= rocketDepositPool.getBalance(), "Deposit pool balance is insufficient for pre deposit");          
        }
        // Emit deposit received event
        emit DepositReceived(msg.sender, msg.value, block.timestamp);
        // Increase ETH matched (used to calculate RPL collateral requirements)
        _increaseEthMatched(msg.sender, launchAmount.sub(_bondAmount));
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

    /// @dev Processes a node deposit with the deposit pool
    /// @param _preLaunchValue The prelaunch value (result of call to `RocketDAOProtocolSettingsMinipool.getPreLaunchValue()`
    /// @param _bondAmount The bond amount for this deposit
    function _processNodeDeposit(uint256 _preLaunchValue, uint256 _bondAmount) private {
        // Get contracts
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        // Retrieve ETH from deposit pool if required
        uint256 shortFall = 0;
        if (msg.value < _preLaunchValue) {
            shortFall = _preLaunchValue.sub(msg.value);
            rocketDepositPool.nodeCreditWithdrawal(shortFall);
        }
        uint256 remaining = msg.value.add(shortFall).sub(_preLaunchValue);
        // Deposit the left over value into the deposit pool
        rocketDepositPool.nodeDeposit{value: remaining}(_bondAmount.sub(_preLaunchValue));
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
        _increaseEthMatched(msg.sender, launchAmount.sub(_bondAmount));
        // Create the minipool
        _createVacantMinipool(_salt, _validatorPubkey, _bondAmount, _expectedMinipoolAddress, _currentBalance);
    }

    /// @notice Called by minipools during bond reduction to increase the amount of ETH the node operator has
    /// @param _nodeAddress The node operator's address to increase the ETH matched for
    /// @param _amount The amount to increase the ETH matched
    /// @dev Will revert if the new ETH matched amount exceeds the node operators limit
    function increaseEthMatched(address _nodeAddress, uint256 _amount) override external onlyLatestContract("rocketNodeDeposit", address(this)) onlyLatestNetworkContract() {
        _increaseEthMatched(_nodeAddress, _amount);
    }

    /// @dev Increases the amount of ETH that has been matched against a node operators bond. Reverts if it exceeds the
    ///      collateralisation requirements of the network
    function _increaseEthMatched(address _nodeAddress, uint256 _amount) private {
        // Check amount doesn't exceed limits
        RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
        uint256 ethMatched = rocketNodeStaking.getNodeETHMatched(_nodeAddress).add(_amount);
        require(
            ethMatched <= rocketNodeStaking.getNodeETHMatchedLimit(_nodeAddress),
            "ETH matched after deposit exceeds limit based on node RPL stake"
        );
        setUint(keccak256(abi.encodePacked("eth.matched.node.amount", _nodeAddress)), ethMatched);
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
