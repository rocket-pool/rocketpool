pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

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

// Handles node deposits and minipool creation

contract RocketNodeDeposit is RocketBase, RocketNodeDepositInterface {

    // Libs
    using SafeMath for uint;

    // Events
    event DepositReceived(address indexed from, uint256 amount, uint256 time);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 3;
    }

    // Accept incoming ETH from the deposit pool
    receive() external payable onlyLatestContract("rocketDepositPool", msg.sender) {}

    // Returns a node operator's credit balance in wei
    function getNodeDepositCredit(address _nodeOperator) public view returns (uint256) {
        return getUint(keccak256(abi.encodePacked("node.deposit.credit.balance", _nodeOperator)));
    }

    function increaseDepositCreditBalance(address _nodeOperator, uint256 _amount) override external onlyRegisteredMinipool(msg.sender) onlyLatestContract("rocketNodeDeposit", address(this)) {
        addUint(keccak256(abi.encodePacked("node.deposit.credit.balance", _nodeOperator)), _amount);
    }

    // Accept a node deposit and create a new minipool under the node
    // Only accepts calls from registered nodes
    function deposit(uint256 _depositAmount, uint256 _minimumNodeFee, bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot, uint256 _salt, address _expectedMinipoolAddress) override external payable onlyLatestContract("rocketNodeDeposit", address(this)) onlyRegisteredNode(msg.sender) {
        uint256 credit = getNodeDepositCredit(msg.sender);

        if (credit < _depositAmount) {
            uint256 shortFall = _depositAmount.sub(credit);
            require(msg.value == shortFall, "Invalid value");
            setUint(keccak256(abi.encodePacked("node.deposit.credit.balance", msg.sender)), 0);
        } else {
            subUint(keccak256(abi.encodePacked("node.deposit.credit.balance", msg.sender)), _depositAmount);
        }

        _deposit(_depositAmount, _minimumNodeFee, _validatorPubkey, _validatorSignature, _depositDataRoot, _salt, _expectedMinipoolAddress);
    }

    // Returns true if the given amount is a valid deposit amount
    function isValidDepositAmount(uint256 _amount) override public pure returns (bool) {
        return _amount == 16 ether || _amount == 8 ether;
    }

    // Returns an array of valid deposit amounts
    function getDepositAmounts() override external pure returns (uint256[] memory) {
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 16 ether;
        amounts[1] = 8 ether;
        return amounts;
    }

    // Accept a node deposit and create a new minipool under the node
    // Only accepts calls from registered nodes
    function _deposit(uint256 _value, uint256 _minimumNodeFee, bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot, uint256 _salt, address _expectedMinipoolAddress) private {
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        // Check pre-conditions
        checkDepositsEnabled();
        checkDistributorInitialised();
        checkNodeFee(_minimumNodeFee);
        require(isValidDepositAmount(_value), "Invalid deposit amount");
        // Emit deposit received event
        emit DepositReceived(msg.sender, msg.value, block.timestamp);
        RocketMinipoolInterface minipool = createMinipool(_salt, _expectedMinipoolAddress);
        // Get the pre-launch value
        uint256 preLaunchValue = getPreLaunchValue();
        // Retrieve ETH from deposit pool if required
        if (msg.value < preLaunchValue) {
            uint256 shortFall = preLaunchValue.sub(msg.value);
            rocketDepositPool.nodeCreditWithdrawal(shortFall);
        }
        // Perform the pre-deposit
        minipool.preDeposit{value: preLaunchValue}(_value, _validatorPubkey, _validatorSignature, _depositDataRoot);
        if (address(this).balance > 0) {
            // Deposit the left over value into the deposit pool
            rocketDepositPool.nodeDeposit{value: msg.value.sub(preLaunchValue)}();
        }
        // Enqueue the minipool
        enqueueMinipool(address(minipool));
        // Increase ETH matched (used to calculate RPL collateral requirements)
        // TODO: This 32 ETH probably shouldn't be a literal
        increaseEthMatched(msg.sender, uint256(32 ether).sub(_value));
        // Assign deposits if enabled
        assignDeposits();
    }

    function increaseEthMatched(address _nodeAddress, uint256 _amount) private {
        // Check amount doesn't exceed limits
        RocketNodeStakingInterface rocketNodeStaking = RocketNodeStakingInterface(getContractAddress("rocketNodeStaking"));
        require(
            rocketNodeStaking.getNodeETHMatched(_nodeAddress).add(_amount) <= rocketNodeStaking.getNodeETHMatchedLimit(_nodeAddress),
            "ETH matched after deposit exceeds limit based on node RPL stake"
        );
        // Update ETH matched
        uint256 ethMatched = getUint(keccak256(abi.encodePacked("eth.matched.node.amount", _nodeAddress)));
        if (ethMatched == 0) {
            RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
            // Migration from legacy minipools which all had 16 ETH matched
            ethMatched = rocketMinipoolManager.getNodeStakingMinipoolCount(_nodeAddress).mul(16 ether);
        }
        ethMatched = ethMatched.add(_amount);
        setUint(keccak256(abi.encodePacked("eth.matched.node.amount", _nodeAddress)), ethMatched);
    }

    function enqueueMinipool(address _minipoolAddress) private {
        // Add minipool to queue
        RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue")).enqueueMinipool(_minipoolAddress);
    }

    function getPreLaunchValue() private view returns (uint256) {
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        return rocketDAOProtocolSettingsMinipool.getPreLaunchValue();
    }

    function checkDistributorInitialised() private view {
        // Check node has initialised their fee distributor
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        require(rocketNodeManager.getFeeDistributorInitialised(msg.sender), "Fee distributor not initialised");
    }

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

    function checkNodeFee(uint256 _minimumNodeFee) private view {
        // Load contracts
        RocketNetworkFeesInterface rocketNetworkFees = RocketNetworkFeesInterface(getContractAddress("rocketNetworkFees"));
        // Check current node fee
        uint256 nodeFee = rocketNetworkFees.getNodeFee();
        require(nodeFee >= _minimumNodeFee, "Minimum node fee exceeds current network node fee");
    }

    function checkDepositsEnabled() private view {
        // Get contracts
        RocketDAOProtocolSettingsNodeInterface rocketDAOProtocolSettingsNode = RocketDAOProtocolSettingsNodeInterface(getContractAddress("rocketDAOProtocolSettingsNode"));
        // Check node settings
        require(rocketDAOProtocolSettingsNode.getDepositEnabled(), "Node deposits are currently disabled");
    }

    function assignDeposits() private {
        RocketDAOProtocolSettingsDepositInterface rocketDAOProtocolSettingsDeposit = RocketDAOProtocolSettingsDepositInterface(getContractAddress("rocketDAOProtocolSettingsDeposit"));
        if (rocketDAOProtocolSettingsDeposit.getAssignDepositsEnabled()) {
            RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
            rocketDepositPool.assignDeposits();
        }
    }
}
