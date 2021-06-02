pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "./RocketMinipoolStorageLayout.sol";
import "../../interface/casper/DepositInterface.sol";
import "../../interface/deposit/RocketDepositPoolInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/minipool/RocketMinipoolQueueInterface.sol";
import "../../interface/network/RocketNetworkWithdrawalInterface.sol";
import "../../interface/node/RocketNodeManagerInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import "../../types/MinipoolDeposit.sol";
import "../../types/MinipoolStatus.sol";

// An individual minipool in the Rocket Pool network

contract RocketMinipoolDelegate is RocketMinipoolStorageLayout, RocketMinipoolInterface {

    // Libs
    using SafeMath for uint;

    // Events
    event StatusUpdated(uint8 indexed status, uint256 time);
    event EtherDeposited(address indexed from, uint256 amount, uint256 time);
    event EtherWithdrawn(address indexed to, uint256 amount, uint256 time);


    // Status getters
    function getStatus() override public view returns (MinipoolStatus) { return status; }
    function getStatusBlock() override public view returns (uint256) { return statusBlock; }
    function getStatusTime() override public view returns (uint256) { return statusTime; }

    // Deposit type getter
    function getDepositType() override public view returns (MinipoolDeposit) { return depositType; }

    // Node detail getters
    function getNodeAddress() override public view returns (address) { return nodeAddress; }
    function getNodeFee() override public view returns (uint256) { return nodeFee; }
    function getNodeDepositBalance() override public view returns (uint256) { return nodeDepositBalance; }
    function getNodeRefundBalance() override public view returns (uint256) { return nodeRefundBalance; }
    function getNodeDepositAssigned() override public view returns (bool) { return nodeDepositAssigned; }

    // User deposit detail getters
    function getUserDepositBalance() override public view returns (uint256) { return userDepositBalance; }
    function getUserDepositAssigned() override public view returns (bool) { return userDepositAssigned; }
    function getUserDepositAssignedTime() override public view returns (uint256) { return userDepositAssignedTime; }

    // Staking detail getters
    function getStakingStartBalance() override public view returns (uint256) { return stakingStartBalance; }
    function getStakingEndBalance() override public view returns (uint256) { return stakingEndBalance; }

    // Get the withdrawal credentials for the minipool contract
    function getWithdrawalCredentials() override public view returns (bytes memory) {
        return abi.encodePacked(byte(0x01), bytes11(0x0), address(this));
    }

    // Prevent direct calls to this contract
    modifier onlyInitialised() {
        require(initialised, "Delegate contract cannot be called directly");
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

    // Require that the address is a registered minipool
    // Prevents methods from being run directly on the delegate contract
    modifier onlyRegisteredMinipool(address _minipoolAddress) {
        require(rocketStorage.getBool(keccak256(abi.encodePacked("minipool.exists", _minipoolAddress))), "Invalid minipool");
        _;
    }

    // Get the address of a Rocket Pool network contract
    function getContractAddress(string memory _contractName) private view returns (address) {
        address contractAddress = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", _contractName)));
        require(contractAddress != address(0x0), "Contract not found");
        return contractAddress;
    }

    // Assign the node deposit to the minipool
    // Only accepts calls from the RocketNodeDeposit contract
    function nodeDeposit() override external payable onlyRegisteredMinipool(address(this)) onlyLatestContract("rocketNodeDeposit", msg.sender) onlyInitialised {
        // Check current status & node deposit status
        require(status == MinipoolStatus.Initialized, "The node deposit can only be assigned while initialized");
        require(!nodeDepositAssigned, "The node deposit has already been assigned");
        // Load contracts
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        // Check deposit amount
        require(msg.value == rocketDAOProtocolSettingsMinipool.getDepositNodeAmount(depositType), "Invalid node deposit amount");
        // Update node deposit details
        nodeDepositBalance = msg.value;
        nodeDepositAssigned = true;
        // Emit ether deposited event
        emit EtherDeposited(msg.sender, msg.value, block.timestamp);
        // Progress full minipool to prelaunch
        if (depositType == MinipoolDeposit.Full) { setStatus(MinipoolStatus.Prelaunch); }
    }

    // Assign user deposited ETH to the minipool and mark it as prelaunch
    // Only accepts calls from the RocketDepositPool contract
    function userDeposit() override external payable onlyRegisteredMinipool(address(this)) onlyLatestContract("rocketDepositPool", msg.sender) onlyInitialised {
        // Check current status & user deposit status
        require(status >= MinipoolStatus.Initialized && status <= MinipoolStatus.Staking, "The user deposit can only be assigned while initialized, in prelaunch, or staking");
        require(!userDepositAssigned, "The user deposit has already been assigned");
        // Load contracts
        RocketDAOProtocolSettingsMinipoolInterface rocketDAOProtocolSettingsMinipool = RocketDAOProtocolSettingsMinipoolInterface(getContractAddress("rocketDAOProtocolSettingsMinipool"));
        // Check deposit amount
        require(msg.value == rocketDAOProtocolSettingsMinipool.getDepositUserAmount(depositType), "Invalid user deposit amount");
        // Update user deposit details
        userDepositBalance = msg.value;
        userDepositAssigned = true;
        userDepositAssignedTime = block.timestamp;
        // Refinance full minipool
        if (depositType == MinipoolDeposit.Full) {
            // Update node balances
            nodeDepositBalance = nodeDepositBalance.sub(msg.value);
            nodeRefundBalance = nodeRefundBalance.add(msg.value);
        }
        // Emit ether deposited event
        emit EtherDeposited(msg.sender, msg.value, block.timestamp);
        // Progress initialized minipool to prelaunch
        if (status == MinipoolStatus.Initialized) { setStatus(MinipoolStatus.Prelaunch); }
    }

    // Refund node ETH refinanced from user deposited ETH
    function refund() override external onlyRegisteredMinipool(address(this)) onlyMinipoolOwner(msg.sender) onlyInitialised {
        // Check refund balance
        require(nodeRefundBalance > 0, "No amount of the node deposit is available for refund");
        // Refund node
        refundNode();
    }

    // Progress the minipool to staking, sending its ETH deposit to the VRC
    // Only accepts calls from the minipool owner (node)
    function stake(bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) override external onlyRegisteredMinipool(address(this)) onlyMinipoolOwner(msg.sender) onlyInitialised {
        // Check current status
        require(status == MinipoolStatus.Prelaunch, "The minipool can only begin staking while in prelaunch");
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
        // Send staking deposit to casper
        casperDeposit.deposit{value: launchAmount}(_validatorPubkey, getWithdrawalCredentials(), _validatorSignature, _depositDataRoot);
        // Set minipool pubkey
        rocketMinipoolManager.setMinipoolPubkey(_validatorPubkey);
        // Progress to staking
        setStatus(MinipoolStatus.Staking);
    }

    // Mark the minipool as withdrawable and record its final balance
    // Only accepts calls from the RocketMinipoolStatus contract
    function setWithdrawable(uint256 _stakingStartBalance, uint256 _stakingEndBalance) override external onlyRegisteredMinipool(address(this)) onlyLatestContract("rocketMinipoolStatus", msg.sender) onlyInitialised {
        // Check current status
        require(status == MinipoolStatus.Staking, "The minipool can only become withdrawable while staking");
        // Set staking details
        stakingStartBalance = _stakingStartBalance;
        stakingEndBalance = _stakingEndBalance;
        // Remove minipool from queue
        if (!userDepositAssigned) {
            RocketMinipoolQueueInterface rocketMinipoolQueue = RocketMinipoolQueueInterface(getContractAddress("rocketMinipoolQueue"));
            rocketMinipoolQueue.removeMinipool(depositType);
        }
        // Progress to withdrawable
        setStatus(MinipoolStatus.Withdrawable);
    }


    // Payout the ETH to the node operator and rETH contract now
    // Minipool should be in withdrawable status, and only set that way once it has a balance close to the stakingEndBalance
    // Requires confirmation by the node operator to execute this as it will also destroy the minipool
    // Should only ever be executed once the minipool has received an ETH balance from the SWC, onus is on the node operator
    function payout(bool _confirmPayout) override external onlyRegisteredMinipool(address(this)) onlyInitialised {
        // Require confirmation the node operator wishes to pay out now with the current ETH balance on the contract
        require(_confirmPayout, "Node operator did not confirm they wish to payout now");
        // Check current status
        require(status == MinipoolStatus.Withdrawable, "The minipool's validator balance can only be sent while withdrawable");
        // load contracts
        RocketNetworkWithdrawalInterface rocketNetworkWithdrawal = RocketNetworkWithdrawalInterface(getContractAddress("rocketNetworkWithdrawal"));
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        // Get the node operators withdrawal address
        address nodeWithdrawalAddress = rocketNodeManager.getNodeWithdrawalAddress(nodeAddress);
        // The withdrawal address must be the one processing the withdrawal. It can be the node operators address or another one they have set to receive withdrawals instead of their node account
        require(nodeWithdrawalAddress == msg.sender || nodeAddress == msg.sender, "The payout function must be called by the current node operators withdrawal address");
        // Process validator withdrawal for minipool, send ETH to the node owner and rETH contract
        // We must also account for a possible node refund balance on the contract from users staking 32 ETH that have received a 16 ETH refund after the protocol bought out 16 ETH
        rocketNetworkWithdrawal.processWithdrawal{value: address(this).balance.sub(nodeRefundBalance)}(nodeWithdrawalAddress);
        // Destroy minipool now
        destroy();
    }

    // Dissolve the minipool, returning user deposited ETH to the deposit pool
    // Only accepts calls from the minipool owner (node), or from any address if timed out
    function dissolve() override external onlyRegisteredMinipool(address(this)) onlyInitialised {
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
        // Transfer user balance to deposit pool
        if (userDepositBalance > 0) {
            // Transfer 
            rocketDepositPool.recycleDissolvedDeposit{value: userDepositBalance}();
            userDepositBalance = 0; 
            // Emit ether withdrawn event
            emit EtherWithdrawn(address(rocketDepositPool), userDepositBalance, block.timestamp);
        }
        // Remove minipool from queue
        if (!userDepositAssigned) { rocketMinipoolQueue.removeMinipool(depositType); }
        // Progress to dissolved
        setStatus(MinipoolStatus.Dissolved);
    }

    // Withdraw node balances from the minipool and close it
    // Only accepts calls from the minipool owner (node)
    function close() override external onlyRegisteredMinipool(address(this)) onlyMinipoolOwner(msg.sender) onlyInitialised {
        // Check current status
        require(status == MinipoolStatus.Dissolved, "The minipool can only be closed while dissolved");
        // Transfer node balance to node operator
        uint256 nodeBalance = nodeDepositBalance.add(nodeRefundBalance);
        if (nodeBalance > 0) {
            // Update node balances
            nodeDepositBalance = 0;
            nodeRefundBalance = 0;
            // Get node withdrawal address
            RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
            address nodeWithdrawalAddress = rocketNodeManager.getNodeWithdrawalAddress(nodeAddress);
            // Transfer balance
            (bool success,) = nodeWithdrawalAddress.call{value: nodeBalance}("");
            require(success, "Node ETH balance was not successfully transferred to node operator");
            // Emit ether withdrawn event
            emit EtherWithdrawn(nodeWithdrawalAddress, nodeBalance, block.timestamp);
        }
        // Destroy minipool
        destroy();
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
    function refundNode() private {
        // Update refund balance
        uint256 refundAmount = nodeRefundBalance;
        nodeRefundBalance = 0;
        // Get node withdrawal address
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        address nodeWithdrawalAddress = rocketNodeManager.getNodeWithdrawalAddress(nodeAddress);
        // Transfer refund amount
        (bool success,) = nodeWithdrawalAddress.call{value: refundAmount}("");
        require(success, "ETH refund amount was not successfully transferred to node operator");
        // Emit ether withdrawn event
        emit EtherWithdrawn(nodeWithdrawalAddress, refundAmount, block.timestamp);
    }

    // Destroy the minipool
    function destroy() private {
        // Destroy minipool
        RocketMinipoolManagerInterface rocketMinipoolManager = RocketMinipoolManagerInterface(getContractAddress("rocketMinipoolManager"));
        rocketMinipoolManager.destroyMinipool();
        // Send any refund ETH to the node withdrawal account
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        // Self destruct & send any remaining ETH or refund ETH to the node operator's withdrawal address
        selfdestruct(payable(rocketNodeManager.getNodeWithdrawalAddress(nodeAddress)));
    }

}
