pragma solidity >0.5.0 <0.9.0;
pragma abicoder v2;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/RocketVaultInterface.sol";
import "../../interface/deposit/RocketDepositPoolInterface.sol";
import "../../interface/casper/DepositInterface.sol";
import "../../interface/megapool/RocketMegapoolInterface.sol";
import "../../interface/node/RocketNodeManagerInterface.sol";
import "../../interface/dao/node/settings/RocketDAONodeTrustedSettingsMinipoolInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMegapoolInterface.sol";
import "../../interface/token/RocketTokenRETHInterface.sol";

enum Status {
    InQueue,
    PreStaked,
    Assigned,
    Staking,
    Exited,
    Dissolved
}

struct ValidatorInfo {
    Status status;
    bool express;
    uint32 assignmentTime;
    uint32 totalScrubVotes;
    bytes withdrawalCredential;
}

/// @title RocketMegapool
/// @notice This contract manages multiple validators. It serves as the target of Beacon Chain withdrawal credentials.
contract RocketMegapool is RocketBase, RocketMegapoolInterface {

    // Construct
    constructor(address _nodeAddress, RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
        require(address(_rocketStorageAddress) != address(0) && _nodeAddress != address(0), "Missing address");
        // Precompute keys
        rocketVaultKey = keccak256(abi.encodePacked("contract.address", "rocketVault"));
        rocketTokenRPLKey = keccak256(abi.encodePacked("contract.address", "rocketTokenRPL"));
        rocketTokenRETH = payable(getContractAddress("rocketTokenRETH"));
        nodeAddress = _nodeAddress;
    }

    mapping(uint32 => ValidatorInfo) validators;
    mapping(uint256=> mapping(address=>bool)) memberScrubVotes; // validatorId => member address => voted

    // Constants 
    uint256 constant pubKeyLength = 48;
    uint256 constant signatureLength = 96;

    // Events
    event MegapoolValidatorEnqueued(address indexed megapool, uint256 indexed validatorId, uint256 time);
    event MegapoolValidatorDequeued(address indexed megapool, uint256 indexed validatorId, uint256 time);


    // Immutables
    address immutable nodeAddress;
    bytes32 immutable rocketTokenRPLKey;
    bytes32 immutable rocketVaultKey;
    address payable immutable rocketTokenRETH;

    uint256 numValidators;
    uint256 assignedValue;
    uint256 debt;
    uint256 stakedRPL;
    uint256 unstakedRPL;
    uint256 lastUnstakeRequest;
    
    
    // Modifiers
    modifier onlyMegapoolOwner() {
        address withdrawalAddress = rocketStorage.getNodeWithdrawalAddress(nodeAddress);
        require(msg.sender == nodeAddress || msg.sender == withdrawalAddress, "Only the node operator can access this method");
        _;
    }

    modifier onlyRPLWithdrawalAddressOrNode() {
        // Check that the call is coming from RPL withdrawal address (or node if unset)
        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        if (rocketNodeManager.getNodeRPLWithdrawalAddressIsSet(nodeAddress)) {
            address rplWithdrawalAddress = rocketNodeManager.getNodeRPLWithdrawalAddress(nodeAddress);
            require(msg.sender == rplWithdrawalAddress, "Must be called from RPL withdrawal address");
        } else {
            require(msg.sender == nodeAddress, "Must be called from node address");
        }
        _;
    }

    /// @notice Creates a new validator as part of a megapool
    /// @param bondAmount the amount being bonded by the Node Operator for the new validator
    /// @param useExpressTicket if an express ticket should be used
    function newValidator(uint256 bondAmount, bool useExpressTicket) external payable onlyLatestContract("rocketNodeDeposit", msg.sender) {
        require(msg.value == bondAmount, "Invalid value");
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        uint32 validatorId = uint32(numValidators);
        numValidators++;

        validators[validatorId].status = Status.InQueue;
        validators[validatorId].express = useExpressTicket;

        rocketDepositPool.requestFunds{value: msg.value}(validatorId, 32 ether, useExpressTicket);
        
        emit MegapoolValidatorEnqueued(address(this), validatorId, block.timestamp);
    }

    /// @notice removes a validator from the deposit queue
    /// @param validatorId the validator ID
    function dequeue(uint32 validatorId) external onlyMegapoolOwner() {
        require(validators[validatorId].status == Status.InQueue, "Validator must be in queue");
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        rocketDepositPool.exitQueue(validatorId, validators[validatorId].express);
        validators[validatorId].status = Status.Exited;
        
        emit MegapoolValidatorDequeued(address(this), validatorId, block.timestamp);
    }

    /// @notice 
    /// @param validatorId the validator ID
    function assignFunds(uint32 validatorId) external payable onlyLatestContract("rocketDepositPool", msg.sender) {
        validators[validatorId].status = Status.Assigned;
        assignedValue += msg.value;
        validators[validatorId].assignmentTime = uint32(block.timestamp);
    }

    /// @notice Executes the first 1 ETH deposit on the Beacon Chain 
    /// @param validatorId the validator ID
    /// @param pubKey the validator pubKey
    /// @param withdrawalCredentials the withdrawal credentials that are going to be used by the validator
    /// @param signature The signature from the validator of the deposit data
    /// @param depositDataRoot The hash tree root of the deposit data 
    function preStake(uint32 validatorId, bytes calldata pubKey, bytes calldata withdrawalCredentials, bytes calldata signature, bytes32 depositDataRoot) external onlyMegapoolOwner() {
        validateBytes(pubKey, pubKeyLength);
        validateBytes(signature, signatureLength);
    
        validators[validatorId].status = Status.PreStaked;
        DepositInterface casperDeposit = DepositInterface(getContractAddress("casperDeposit"));

        assignedValue -= 1 ether;
        // Perform the 1 ETH prestake 
        casperDeposit.deposit{value : 1 ether}(pubKey, withdrawalCredentials, signature, depositDataRoot);
    }

    /// @notice performs the remaining ETH deposit on the Beacon Chain
    /// @param validatorId the validator ID
    /// @param pubKey '
    /// @param signature '
    /// @param withdrawalCredentialStateProof '
    function stake(uint32 validatorId, bytes calldata pubKey, bytes calldata signature, bytes32 depositDataRoot, StateProof calldata withdrawalCredentialStateProof) external onlyMegapoolOwner() {
        validateBytes(pubKey, pubKeyLength);
        validateBytes(signature, signatureLength);
        require(validators[validatorId].status == Status.PreStaked, "Invalid status");
    
        // Get scrub period
        RocketDAONodeTrustedSettingsMinipoolInterface rocketDAONodeTrustedSettingsMinipool = RocketDAONodeTrustedSettingsMinipoolInterface(getContractAddress("rocketDAONodeTrustedSettingsMinipool"));
        uint256 scrubPeriod = rocketDAONodeTrustedSettingsMinipool.getScrubPeriod();
        require(block.timestamp > validators[validatorId].assignmentTime + scrubPeriod, "Not past the scrub period");
    
        validators[validatorId].status = Status.Staking;
        DepositInterface casperDeposit = DepositInterface(getContractAddress("casperDeposit"));
        assignedValue -= 31 ether;
        bytes memory withdrawalCredentials = validators[validatorId].withdrawalCredential;
        
        // TODO: Verify state proof to ensure validator has correct withdrawal credentials

        // Perform remaining 31 ETH stake onto beaconchain
        casperDeposit.deposit{value : 31 ether}(pubKey, withdrawalCredentials, signature, depositDataRoot);
        
    }

    /// @notice Dissolves a validator  
    /// @param validatorId the validator ID
    function dissolveValidator(uint32 validatorId) external {
        ValidatorInfo storage validator = validators[validatorId];
        // Check current status
        require(validator.status == Status.PreStaked, "The validator can only be dissolved while in PreStaked status");
        
        //require(block.timestamp > validator.assignmentTime + getTimeBeforeDissolved(), "Cannot dissolve the validator");
        
        // Exit the validator from the queue
        RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(getContractAddress("rocketDepositPool"));
        rocketDepositPool.exitQueue(validatorId, validator.express);
        
        // Update the status to dissolved
        validator.status = Status.Dissolved;

        // TODO: Perform the dissolution

    }

    /// @notice Receives ETH, which is sent to the rETH contract, to repay a Megapool debt
    function repayDebt() external payable {
        require(msg.value > 0, "Invalid value received");
        require(debt >= msg.value, "Not enough debt");
        
        (bool success, ) = rocketTokenRETH.call{value: msg.value}("");
        require(success, "Failed to send ETH to the rETH contract");

        // Should not revert as debt >= msg.value
        unchecked {
            debt -= msg.value;
        }
    }

    /// @notice stakes RPL on the megapool
    /// @param _amount the RPL amount to be staked on this megapool
    function stakeRPL(uint256 _amount) external {
        require(_amount > 0, "Invalid amount");

        address rplTokenAddress = getAddress(rocketTokenRPLKey);
        IERC20 rplToken = IERC20(rplTokenAddress);

        // Transfer RPL tokens
        require(rplToken.transferFrom(msg.sender, address(this), _amount), "Could not transfer RPL to staking contract");
        stakedRPL += _amount;

    }

    /// @notice requests RPL previously staked on this megapool to be unstaked
    // @param _amount the RPL amount to be unstaked 
    function requestUnstakeRPL(uint256 _amount) external onlyRPLWithdrawalAddressOrNode() {
        lastUnstakeRequest = block.timestamp;

        require(_amount > 0 && _amount >= stakedRPL , "Invalid amount");

        stakedRPL -= _amount;
        unstakedRPL += _amount;       
    }

    /// @notice unstakes RPL after waiting the 'unstaking period' after the last unstake request 
    function unstakeRPL() external onlyRPLWithdrawalAddressOrNode() {
        RocketDAOProtocolSettingsMegapoolInterface protocolSettingsMegapool = RocketDAOProtocolSettingsMegapoolInterface(getContractAddress("rocketDAOProtocolSettingsMegapool"));
        uint256 unstakingPeriod = protocolSettingsMegapool.getUnstakingPeriod();
        require(lastUnstakeRequest + unstakingPeriod >= block.timestamp, "Not enough time passed since last unstake RPL request");
        address rplWithdrawalAddress;

        RocketNodeManagerInterface rocketNodeManager = RocketNodeManagerInterface(getContractAddress("rocketNodeManager"));
        if (rocketNodeManager.getNodeRPLWithdrawalAddressIsSet(nodeAddress)) {
            rplWithdrawalAddress = rocketNodeManager.getNodeRPLWithdrawalAddress(nodeAddress);
        } else {
            rplWithdrawalAddress = nodeAddress;
        }

        address rplAddress = getAddress(rocketTokenRPLKey);

        uint256 unstakedAmount = unstakedRPL;
        unstakedRPL = 0;

        RocketVaultInterface rocketVault = RocketVaultInterface(getAddress(rocketVaultKey));
        rocketVault.withdrawToken(rplWithdrawalAddress, IERC20(rplAddress), unstakedAmount);
    }

    /// @notice Gets the Node address associated to this megapool
    function getNodeAddress() public view returns (address) {
        return nodeAddress;
    }

    /// @notice validates that a byte array has the expected length
    /// @param data the byte array being validated
    /// @param _length the expected length
    function validateBytes(bytes memory data, uint256 _length) pure internal {
        require(data.length == _length, "Invalid bytes length");
    }

}