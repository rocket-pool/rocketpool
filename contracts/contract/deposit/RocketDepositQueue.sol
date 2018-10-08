pragma solidity 0.4.24;


import "../../RocketBase.sol";
import "../../interface/RocketNodeInterface.sol";
import "../../interface/RocketPoolInterface.sol";
import "../../interface/deposit/RocketDepositVaultInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/settings/RocketDepositSettingsInterface.sol";
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

    event DepositChunkAssign (
        bytes32 indexed _depositID,
        address indexed _userID,
        address indexed _groupID,
        string  durationID,
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
        rocketPool = RocketPoolInterface(getContractAddress("rocketPool"));
        rocketDepositVault = RocketDepositVaultInterface(getContractAddress("rocketDepositVault"));
        rocketDepositSettings = RocketDepositSettingsInterface(getContractAddress("rocketDepositSettings"));
        bytes32QueueStorage = Bytes32QueueStorageInterface(getContractAddress("utilBytes32QueueStorage"));

        // Get random available minipool to assign chunk to
        address miniPoolAddress = rocketPool.getRandomAvailableMinipool(_durationID, msg.value);
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

        // Update queue balance
        bytes32 balanceKey = keccak256(abi.encodePacked("deposits.queue.balance", _durationID));
        rocketStorage.setUint(balanceKey, rocketStorage.getUint(balanceKey).sub(chunkSize));

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

        // Emit chunk assignment event
        emit DepositChunkAssign(depositID, userID, groupID, _durationID, matchAmount, now);

        // Dequeue deposit if queued amount depleted
        if (queuedAmount == 0) { dequeueDeposit(userID, groupID, _durationID, depositID); }

        // Return updated amount to match
        return _amountToMatch;

    }


}
