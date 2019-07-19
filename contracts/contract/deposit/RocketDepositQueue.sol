pragma solidity 0.5.8;


import "../../RocketBase.sol";
import "../../interface/RocketNodeInterface.sol";
import "../../interface/deposit/RocketDepositIndexInterface.sol";
import "../../interface/deposit/RocketDepositVaultInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolSetInterface.sol";
import "../../interface/settings/RocketDepositSettingsInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
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
    RocketDepositIndexInterface rocketDepositIndex = RocketDepositIndexInterface(0);
    RocketDepositVaultInterface rocketDepositVault = RocketDepositVaultInterface(0);
    RocketMinipoolSetInterface rocketMinipoolSet = RocketMinipoolSetInterface(0);
    RocketDepositSettingsInterface rocketDepositSettings = RocketDepositSettingsInterface(0);
    RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(0);
    Bytes32SetStorageInterface bytes32SetStorage = Bytes32SetStorageInterface(0);
    Bytes32QueueStorageInterface bytes32QueueStorage = Bytes32QueueStorageInterface(0);


    /*** Modifiers *************/

    /// @dev Only passes if the supplied minipool duration is valid
    /// @param _durationID The ID that determines the minipool duration
    modifier onlyValidDuration(string memory _durationID) {
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        rocketMinipoolSettings.getMinipoolStakingDuration(_durationID);
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
    function() external payable onlyLatestContract("rocketDepositVault", msg.sender) {}


    // Get the balance of the deposit queue by duration
    function getBalance(string memory _durationID) public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("deposits.queue.balance", _durationID)));
    }


    // Enqueue a deposit
    function enqueueDeposit(address _userID, address _groupID, string memory _durationID, bytes32 _depositID, uint256 _amount) public onlyLatestContract("rocketDeposit", msg.sender) {

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
    function dequeueDeposit(address _userID, address _groupID, string memory _durationID, bytes32 _depositID) private {

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
    function removeDeposit(address _userID, address _groupID, string memory _durationID, bytes32 _depositID, uint256 _amount) public onlyLatestContract("rocketDeposit", msg.sender) {

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
    function assignChunks(string memory _durationID) public onlyValidDuration(_durationID) {

        // Get contracts
        rocketNode = RocketNodeInterface(getContractAddress("rocketNode"));
        rocketDepositSettings = RocketDepositSettingsInterface(getContractAddress("rocketDepositSettings"));

        // Check queue processing is enabled
        require(rocketDepositSettings.getProcessDepositQueueAllowed(), "Deposit queue processing is currently disabled");

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
    function assignChunk(string memory _durationID) private {

        // Get contracts
        rocketDepositVault = RocketDepositVaultInterface(getContractAddress("rocketDepositVault"));
        rocketMinipoolSet = RocketMinipoolSetInterface(getContractAddress("rocketMinipoolSet"));
        rocketDepositSettings = RocketDepositSettingsInterface(getContractAddress("rocketDepositSettings"));
        bytes32QueueStorage = Bytes32QueueStorageInterface(getContractAddress("utilBytes32QueueStorage"));

        // Get next minipool in the active set to assign chunk to
        address miniPoolAddress = rocketMinipoolSet.getNextActiveMinipool(_durationID, msg.value);
        require(miniPoolAddress != address(0x0), "Invalid available minipool");

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

        // Update queue balance
        bytes32 balanceKey = keccak256(abi.encodePacked("deposits.queue.balance", _durationID));
        rocketStorage.setUint(balanceKey, rocketStorage.getUint(balanceKey).sub(chunkSize));

    }


    // Assign a fragment of a chunk from the first deposit in the queue
    function assignChunkDepositFragment(string memory _durationID, address _miniPoolAddress, uint256 _amountToMatch) private returns (uint256) {

        // Get contracts
        bytes32QueueStorage = Bytes32QueueStorageInterface(getContractAddress("utilBytes32QueueStorage"));
        RocketMinipoolInterface miniPool = RocketMinipoolInterface(_miniPoolAddress);

        // Get deposit details
        bytes32 depositID = bytes32QueueStorage.getQueueItem(keccak256(abi.encodePacked("deposits.queue", _durationID)), 0);
        uint256 queuedAmount = rocketStorage.getUint(keccak256(abi.encodePacked("deposit.queuedAmount", depositID)));
        address userID = rocketStorage.getAddress(keccak256(abi.encodePacked("deposit.userID", depositID)));
        address groupID = rocketStorage.getAddress(keccak256(abi.encodePacked("deposit.groupID", depositID)));

        // Get queued deposit ether amount to match
        uint256 matchAmount = queuedAmount;
        if (matchAmount > _amountToMatch) { matchAmount = _amountToMatch; }

        // Update remaining ether amount to match
        _amountToMatch = _amountToMatch.sub(matchAmount);

        // Update deposit queued amount
        queuedAmount = queuedAmount.sub(matchAmount);

        // Update deposit details
        rocketDepositIndex = RocketDepositIndexInterface(getContractAddress("rocketDepositIndex"));
        rocketDepositIndex.assign(depositID, _miniPoolAddress, matchAmount);

        // Transfer matched amount to minipool contract
        require(miniPool.deposit.value(matchAmount)(depositID, userID, groupID), "Deposit could not be transferred to minipool");

        // Emit chunk fragment assignment event
        emit DepositChunkFragmentAssign(_miniPoolAddress, depositID, userID, groupID, matchAmount, now);

        // Dequeue deposit if queued amount depleted
        if (queuedAmount == 0) { dequeueDeposit(userID, groupID, _durationID, depositID); }

        // Return updated amount to match
        return _amountToMatch;

    }


}
