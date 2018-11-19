pragma solidity 0.4.24;


import "../../RocketBase.sol";
import "../../interface/RocketNodeInterface.sol";
import "../../interface/RocketPoolInterface.sol";
import "../../interface/deposit/RocketDepositVaultInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/settings/RocketDepositSettingsInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../interface/utils/lists/AddressSetStorageInterface.sol";
import "../../interface/utils/lists/Bytes32SetStorageInterface.sol";
import "../../interface/utils/lists/Bytes32QueueStorageInterface.sol";
import "../../lib/SafeMath.sol";


/// @title RocketDepositQueue - manages the Rocket Pool deposit queue
/// @author Jake Pospischil

contract RocketDepositQueue is RocketBase {


    /*** Libs  ******************/


    using SafeMath for uint256;


    /*** Contracts **************/


    RocketNodeInterface rocketNode = RocketNodeInterface(0);
    RocketPoolInterface rocketPool = RocketPoolInterface(0);
    RocketDepositVaultInterface rocketDepositVault = RocketDepositVaultInterface(0);
    RocketDepositSettingsInterface rocketDepositSettings = RocketDepositSettingsInterface(0);
    RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(0);
    AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(0);
    Bytes32SetStorageInterface bytes32SetStorage = Bytes32SetStorageInterface(0);
    Bytes32QueueStorageInterface bytes32QueueStorage = Bytes32QueueStorageInterface(0);


    /*** Modifiers **************/


    // Sender must be a super user or RocketDeposit
    modifier onlySuperUserOrDeposit() {
        require(
            (roleHas("owner", msg.sender) || roleHas("admin", msg.sender)) ||
            msg.sender == rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketDeposit"))),
            "Sender is not a super user or RocketDeposit"
        );
        _;
    }


    /*** Events *****************/


    event DepositEnqueue (
        bytes32 indexed _depositID,
        address indexed _userID,
        address indexed _groupID,
        string  durationID,
        uint256 value,
        uint256 created
    );

    event DepositDequeue (
        bytes32 indexed _depositID,
        address indexed _userID,
        address indexed _groupID,
        string  durationID,
        uint256 created
    );

    event DepositRemove (
        bytes32 indexed _depositID,
        address indexed _userID,
        address indexed _groupID,
        string  durationID,
        uint256 value,
        uint256 created
    );

    event DepositChunkFragmentAssign (
        address indexed _minipoolAddress,
        bytes32 indexed _depositID,
        address userID,
        address groupID,
        uint256 value,
        uint256 created
    );


    /*** Methods ****************/


    // Constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }


    // Default payable function - for deposit vault withdrawals
    function() payable public onlyLatestContract("rocketDepositVault", msg.sender) {}


    // Get the balance of the deposit queue by duration
    function getBalance(string _durationID) public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("deposits.queue.balance", _durationID)));
    }


    // Enqueue a deposit
    function enqueueDeposit(address _userID, address _groupID, string _durationID, bytes32 _depositID, uint256 _amount) public onlyLatestContract("rocketDeposit", msg.sender) {

        // Get contracts
        bytes32SetStorage = Bytes32SetStorageInterface(getContractAddress("utilBytes32SetStorage"));
        bytes32QueueStorage = Bytes32QueueStorageInterface(getContractAddress("utilBytes32QueueStorage"));

        // Add deposit to queue
        bytes32SetStorage.addItem(keccak256(abi.encodePacked("user.deposits.queued", _userID, _groupID, _durationID)), _depositID);
        bytes32QueueStorage.enqueueItem(keccak256(abi.encodePacked("deposits.queue", _durationID)), _depositID);

        // Update queue balance
        bytes32 balanceKey = keccak256(abi.encodePacked("deposits.queue.balance", _durationID));
        rocketStorage.setUint(balanceKey, rocketStorage.getUint(balanceKey).add(_amount));

        // Emit enqueue event
        emit DepositEnqueue(_depositID, _userID, _groupID, _durationID, _amount, now);

    }


    // Dequeue a deposit
    function dequeueDeposit(address _userID, address _groupID, string _durationID, bytes32 _depositID) private {

        // Get contracts
        bytes32SetStorage = Bytes32SetStorageInterface(getContractAddress("utilBytes32SetStorage"));
        bytes32QueueStorage = Bytes32QueueStorageInterface(getContractAddress("utilBytes32QueueStorage"));

        // Remove deposit from queue indexes
        bytes32SetStorage.removeItem(keccak256(abi.encodePacked("user.deposits.queued", _userID, _groupID, _durationID)), _depositID);
        bytes32QueueStorage.dequeueItem(keccak256(abi.encodePacked("deposits.queue", _durationID)));

        // Emit dequeue event
        emit DepositDequeue(_depositID, _userID, _groupID, _durationID, now);

    }


    // Remove a deposit from the queue
    function removeDeposit(address _userID, address _groupID, string _durationID, bytes32 _depositID, uint256 _amount) public onlyLatestContract("rocketDeposit", msg.sender) {

        // Get contracts
        bytes32SetStorage = Bytes32SetStorageInterface(getContractAddress("utilBytes32SetStorage"));
        bytes32QueueStorage = Bytes32QueueStorageInterface(getContractAddress("utilBytes32QueueStorage"));

        // Remove deposit from queue; reverts if not found
        bytes32SetStorage.removeItem(keccak256(abi.encodePacked("user.deposits.queued", _userID, _groupID, _durationID)), _depositID);
        bytes32QueueStorage.removeItem(keccak256(abi.encodePacked("deposits.queue", _durationID)), _depositID);

        // Update queue balance
        bytes32 balanceKey = keccak256(abi.encodePacked("deposits.queue.balance", _durationID));
        rocketStorage.setUint(balanceKey, rocketStorage.getUint(balanceKey).sub(_amount));

        // Emit remove event
        emit DepositRemove(_depositID, _userID, _groupID, _durationID, _amount, now);

    }


    // Assign chunks while able
    function assignChunks(string _durationID) public onlySuperUserOrDeposit() {

        // Get contracts
        rocketNode = RocketNodeInterface(getContractAddress("rocketNode"));
        rocketDepositSettings = RocketDepositSettingsInterface(getContractAddress("rocketDepositSettings"));

        // Deposit settings
        uint256 chunkSize = rocketDepositSettings.getDepositChunkSize();
        uint256 maxChunkAssignments = rocketDepositSettings.getChunkAssignMax();

        // Assign chunks while able
        uint256 chunkAssignments = 0;
        while (
            rocketStorage.getUint(keccak256(abi.encodePacked("deposits.queue.balance", _durationID))) >= chunkSize && // Duration queue balance high enough to assign chunk
            rocketNode.getAvailableNodeCount(_durationID) > 0 && // Nodes (and minipools) with duration are available for assignment
            chunkAssignments++ < maxChunkAssignments // Only assign up to maximum number of chunks
        ) {
            assignChunk(_durationID);
        }

    }


    // Assign chunk
    function assignChunk(string _durationID) private {

        // Get contracts
        rocketDepositVault = RocketDepositVaultInterface(getContractAddress("rocketDepositVault"));
        rocketDepositSettings = RocketDepositSettingsInterface(getContractAddress("rocketDepositSettings"));
        bytes32QueueStorage = Bytes32QueueStorageInterface(getContractAddress("utilBytes32QueueStorage"));

        // Get next minipool in the active set to assign chunk to
        address miniPoolAddress = getNextActiveMinipool(_durationID, msg.value);
        require(miniPoolAddress != 0x0, "Invalid available minipool");

        // Remaining ether amount to match
        uint256 chunkSize = rocketDepositSettings.getDepositChunkSize();
        uint256 amountToMatch = chunkSize;

        // Withdraw chunk ether from vault
        require(rocketDepositVault.withdrawEther(address(this), chunkSize), "Chunk could not be transferred from vault");

        // Assign chunk fragments from queued deposits
        // Max number of iterations is (DepositChunkSize / DepositMin) + 1
        while (bytes32QueueStorage.getQueueLength(keccak256(abi.encodePacked("deposits.queue", _durationID))) > 0) {
            amountToMatch = assignChunkDepositFragment(_durationID, miniPoolAddress, amountToMatch);
            if (amountToMatch == 0) { break; }
        }

        // Double-check required ether amount has been matched
        require(amountToMatch == 0, "Required ether amount was not matched");

        // Remove minipool from active set if no longer assignable
        RocketMinipoolInterface miniPool = RocketMinipoolInterface(miniPoolAddress);
        if (miniPool.getStatus() > 1) { addressSetStorage.removeItem(keccak256(abi.encodePacked("minipools.active", _durationID)), miniPoolAddress); }

        // Update queue balance
        bytes32 balanceKey = keccak256(abi.encodePacked("deposits.queue.balance", _durationID));
        rocketStorage.setUint(balanceKey, rocketStorage.getUint(balanceKey).sub(chunkSize));

    }


    // Get next minipool in the active set
    function getNextActiveMinipool(string _durationID, uint256 _seed) private returns (address) {

        // Get contracts
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));

        // Get active minipool count
        uint256 activeMinipoolCount = addressSetStorage.getCount(keccak256(abi.encodePacked("minipools.active", _durationID)));

        // Build active minipool set if empty
        if (activeMinipoolCount == 0) {

            // Get settings
            rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
            uint256 activeSetSize = rocketMinipoolSettings.getMinipoolActiveSetSize();

            // Get node counts
            uint256 untrustedNodeCount = addressSetStorage.getCount(keccak256(abi.encodePacked("nodes.available", false, _durationID)));
            uint256 trustedNodeCount = addressSetStorage.getCount(keccak256(abi.encodePacked("nodes.available", true, _durationID)));

            // Get active set node counts
            uint256 untrustedNodeSetCount = untrustedNodeCount;
            uint256 trustedNodeSetCount = trustedNodeCount;
            if (untrustedNodeSetCount > activeSetSize) untrustedNodeSetCount = activeSetSize;
            if (trustedNodeSetCount > activeSetSize.sub(untrustedNodeSetCount)) trustedNodeSetCount = activeSetSize.sub(untrustedNodeSetCount);

            // Add random node minipools to active set
            for (uint256 i = 0; i < untrustedNodeSetCount; ++i) { addRandomNodeMinipool(_durationID, _seed, false, untrustedNodeCount, i); }
            for (uint256 j = 0; j < trustedNodeSetCount; ++j) { addRandomNodeMinipool(_durationID, _seed, true, trustedNodeCount, j); }

            // Get new active minipool count
            activeMinipoolCount = untrustedNodeSetCount + trustedNodeSetCount;

        }

        // Get & increment active minipool offset
        uint256 offset = rocketStorage.getUint(keccak256(abi.encodePacked("minipools.active.offset", _durationID)));
        rocketStorage.setUint(keccak256(abi.encodePacked("minipools.active.offset", _durationID)), (offset + 1) % activeMinipoolCount);

        // Return active minipool
        return addressSetStorage.getItem(keccak256(abi.encodePacked("minipools.active", _durationID)), offset);

    }


    // Add random node minipool to active set
    function addRandomNodeMinipool(string _durationID, uint256 _seed, bool _trusted, uint256 _nodeCount, uint256 _offset) private {

        // Get contracts
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));

        // Get random node
        uint256 nodeIndex = uint256(keccak256(abi.encodePacked(block.number, block.timestamp, _seed))).add(_offset) % _nodeCount;
        address nodeAddress = addressSetStorage.getItem(keccak256(abi.encodePacked("nodes.available", _trusted, _durationID)), nodeIndex);

        // Get first minipool and add to active set
        // :TODO: remove timed out minipools from active set
        address miniPoolAddress = addressSetStorage.getItem(keccak256(abi.encodePacked("minipools", "list.node.available", nodeAddress, _trusted, _durationID)), 0);
        addressSetStorage.addItem(keccak256(abi.encodePacked("minipools.active", _durationID)), miniPoolAddress);

    }


    // Assign a fragment of a chunk from the first deposit in the queue
    function assignChunkDepositFragment(string _durationID, address _miniPoolAddress, uint256 _amountToMatch) private returns (uint256) {

        // Get contracts
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        bytes32QueueStorage = Bytes32QueueStorageInterface(getContractAddress("utilBytes32QueueStorage"));
        RocketMinipoolInterface miniPool = RocketMinipoolInterface(_miniPoolAddress);

        // Get deposit details
        bytes32 depositID = bytes32QueueStorage.getQueueItem(keccak256(abi.encodePacked("deposits.queue", _durationID)), 0);
        uint256 queuedAmount = rocketStorage.getUint(keccak256(abi.encodePacked("deposit.queuedAmount", depositID)));
        uint256 stakingAmount = rocketStorage.getUint(keccak256(abi.encodePacked("deposit.stakingAmount", depositID)));
        address userID = rocketStorage.getAddress(keccak256(abi.encodePacked("deposit.userID", depositID)));
        address groupID = rocketStorage.getAddress(keccak256(abi.encodePacked("deposit.groupID", depositID)));

        // Get queued deposit ether amount to match
        uint256 matchAmount = queuedAmount;
        if (matchAmount > _amountToMatch) { matchAmount = _amountToMatch; }

        // Update remaining ether amount to match
        _amountToMatch = _amountToMatch.sub(matchAmount);

        // Update deposit queued / staking ether amounts
        queuedAmount = queuedAmount.sub(matchAmount);
        stakingAmount = stakingAmount.add(matchAmount);
        rocketStorage.setUint(keccak256(abi.encodePacked("deposit.queuedAmount", depositID)), queuedAmount);
        rocketStorage.setUint(keccak256(abi.encodePacked("deposit.stakingAmount", depositID)), stakingAmount);

        // Add deposit staking pool details
        uint256 stakingPoolAmount = rocketStorage.getUint(keccak256(abi.encodePacked("deposit.stakingPoolAmount", depositID, _miniPoolAddress)));
        if (stakingPoolAmount == 0) { addressSetStorage.addItem(keccak256(abi.encodePacked("deposit.stakingPools", depositID)), _miniPoolAddress); }
        rocketStorage.setUint(keccak256(abi.encodePacked("deposit.stakingPoolAmount", depositID, _miniPoolAddress)), stakingPoolAmount.add(matchAmount));

        // Transfer matched amount to minipool contract
        require(miniPool.deposit.value(matchAmount)(userID, groupID), "Deposit could not be transferred to minipool");

        // Emit chunk fragment assignment event
        emit DepositChunkFragmentAssign(_miniPoolAddress, depositID, userID, groupID, matchAmount, now);

        // Dequeue deposit if queued amount depleted
        if (queuedAmount == 0) { dequeueDeposit(userID, groupID, _durationID, depositID); }

        // Return updated amount to match
        return _amountToMatch;

    }


}
