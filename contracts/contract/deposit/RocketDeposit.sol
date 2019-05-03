pragma solidity 0.5.8;


import "../../RocketBase.sol";
import "../../interface/deposit/RocketDepositIndexInterface.sol";
import "../../interface/deposit/RocketDepositQueueInterface.sol";
import "../../interface/deposit/RocketDepositVaultInterface.sol";
import "../../interface/group/RocketGroupAccessorContractInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/settings/RocketDepositSettingsInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../interface/token/RocketBETHTokenInterface.sol";
import "../../interface/utils/lists/AddressSetStorageInterface.sol";
import "../../lib/SafeMath.sol";


/// @title RocketDeposit - manages deposits into the Rocket Pool network
/// @author Jake Pospischil

contract RocketDeposit is RocketBase {


    /*** Libs  ******************/


    using SafeMath for uint256;


    /**** Properties ************/


    uint256 private calcBase = 1 ether;


    /*** Contracts **************/


    RocketDepositIndexInterface rocketDepositIndex = RocketDepositIndexInterface(0);
    RocketDepositQueueInterface rocketDepositQueue = RocketDepositQueueInterface(0);
    RocketDepositVaultInterface rocketDepositVault = RocketDepositVaultInterface(0);
    RocketDepositSettingsInterface rocketDepositSettings = RocketDepositSettingsInterface(0);
    RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(0);
    RocketBETHTokenInterface rocketBETHToken = RocketBETHTokenInterface(0);
    AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(0);


    /*** Modifiers **************/


    // Sender must be RocketDepositVault or Minipool
    modifier onlyDepositVaultOrMinipool() {
        require(
            msg.sender == rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketDepositVault"))) ||
            rocketStorage.getBool(keccak256(abi.encodePacked("minipool.exists", msg.sender))),
            "Sender is not RocketDepositVault or Minipool"
        );
        _;
    }


    /*** Methods ****************/


    // Constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }


    // Default payable function - for deposit vault withdrawals or minipool refunds
    function() external payable onlyDepositVaultOrMinipool() {}


    // Create a new deposit
    function create(address _userID, address _groupID, string memory _durationID) payable public onlyLatestContract("rocketDepositAPI", msg.sender) returns (bool) {

        // Check deposit amount
        require(msg.value > 0, "Invalid deposit amount sent");

        // Add deposit
        rocketDepositIndex = RocketDepositIndexInterface(getContractAddress("rocketDepositIndex"));
        bytes32 depositID = rocketDepositIndex.add(_userID, _groupID, _durationID, msg.value);

        // Add deposit to queue
        rocketDepositQueue = RocketDepositQueueInterface(getContractAddress("rocketDepositQueue"));
        rocketDepositQueue.enqueueDeposit(_userID, _groupID, _durationID, depositID, msg.value);

        // Transfer deposit amount to vault
        rocketDepositVault = RocketDepositVaultInterface(getContractAddress("rocketDepositVault"));
        require(rocketDepositVault.depositEther.value(msg.value)(), "Deposit could not be transferred to vault");

        // Assign chunks
        rocketDepositQueue.assignChunks(_durationID);

        // Return success flag
        return true;

    }


    // Refund a queued deposit
    function refund(address _userID, address _groupID, string memory _durationID, bytes32 _depositID, address _depositorAddress) public onlyLatestContract("rocketDepositAPI", msg.sender) returns (uint256) {

        // Get remaining queued amount to refund
        uint256 refundAmount = rocketStorage.getUint(keccak256(abi.encodePacked("deposit.queuedAmount", _depositID)));

        // Remove deposit from queue; reverts if not found
        rocketDepositQueue = RocketDepositQueueInterface(getContractAddress("rocketDepositQueue"));
        rocketDepositQueue.removeDeposit(_userID, _groupID, _durationID, _depositID, refundAmount);

        // Update deposit details
        rocketDepositIndex = RocketDepositIndexInterface(getContractAddress("rocketDepositIndex"));
        rocketDepositIndex.refund(_depositID, refundAmount);

        // Withdraw refund amount from vault
        rocketDepositVault = RocketDepositVaultInterface(getContractAddress("rocketDepositVault"));
        require(rocketDepositVault.withdrawEther(address(this), refundAmount), "Refund amount could not be transferred from vault");

        // Transfer refund amount to depositor
        RocketGroupAccessorContractInterface depositor = RocketGroupAccessorContractInterface(_depositorAddress);
        require(depositor.rocketpoolEtherDeposit.value(refundAmount)(), "Deposit refund could not be sent to group depositor");

        // Return refunded amount
        return refundAmount;

    }


    // Refund a deposit fragment from a stalled minipool
    function refundFromStalledMinipool(address _userID, address _groupID, bytes32 _depositID, address _minipool, address _depositorAddress) public onlyLatestContract("rocketDepositAPI", msg.sender) returns (uint256) {

        // Check deposit details
        checkDepositDetails(_userID, _groupID, _depositID, _minipool);

        // Get minipool user balance & refund deposit from minipool
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipool);
        uint256 refundAmount = minipool.getUserDeposit(_userID, _groupID);
        minipool.refund(_userID, _groupID, address(this));

        // Update deposit details
        rocketDepositIndex = RocketDepositIndexInterface(getContractAddress("rocketDepositIndex"));
        rocketDepositIndex.refundFromStalledMinipool(_depositID, _minipool, refundAmount);

        // Transfer refund amount to depositor
        RocketGroupAccessorContractInterface depositor = RocketGroupAccessorContractInterface(_depositorAddress);
        require(depositor.rocketpoolEtherDeposit.value(refundAmount)(), "Minipool deposit refund could not be sent to group depositor");

        // Return refunded amount
        return refundAmount;

    }


    // Withdraw some amount of a deposit fragment from a staking minipool as RPB tokens
    function withdrawFromStakingMinipool(address _userID, address _groupID, bytes32 _depositID, address _minipool, uint256 _amount, address _withdrawerAddress) public onlyLatestContract("rocketDepositAPI", msg.sender) returns (uint256) {

        // Check deposit details
        checkDepositDetails(_userID, _groupID, _depositID, _minipool);

        // Get RPB token amount to withdraw
        rocketDepositSettings = RocketDepositSettingsInterface(getContractAddress("rocketDepositSettings"));
        uint256 tokenAmount = _amount.mul(calcBase.sub(rocketDepositSettings.getStakingWithdrawalFeePerc())).div(calcBase);

        // Mint RPB tokens to withdrawer address
        rocketBETHToken = RocketBETHTokenInterface(getContractAddress("rocketBETHToken"));
        rocketBETHToken.mint(_withdrawerAddress, tokenAmount);

        // Withdraw amount from minipool
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipool);
        minipool.withdrawStaking(_userID, _groupID, _amount, tokenAmount, _withdrawerAddress);

        // Update deposit details
        rocketDepositIndex = RocketDepositIndexInterface(getContractAddress("rocketDepositIndex"));
        rocketDepositIndex.withdrawFromMinipool(_depositID, _minipool, _amount);

        // Return token amount withdrawn
        return tokenAmount;

    }


    // Withdraw a deposit fragment from a withdrawn minipool as RPB tokens
    function withdrawFromWithdrawnMinipool(address _userID, address _groupID, bytes32 _depositID, address _minipool, address _withdrawerAddress) public onlyLatestContract("rocketDepositAPI", msg.sender) returns (uint256) {

        // Check deposit details
        checkDepositDetails(address(0x0), _groupID, _depositID, _minipool);

        // Get initial withdrawer address balance
        rocketBETHToken = RocketBETHTokenInterface(getContractAddress("rocketBETHToken"));
        uint256 initialBalance = rocketBETHToken.balanceOf(_withdrawerAddress);

        // Get minipool contract
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipool);

        // Check user ID
        if (minipool.getUserExists(_userID, _groupID)) { require(rocketStorage.getAddress(keccak256(abi.encodePacked("deposit.userID", _depositID))) == _userID, "Incorrect deposit user ID"); }

        // Check if user is withdrawing from backup address
        if (!minipool.getUserExists(_userID, _groupID) && minipool.getUserBackupAddressExists(_userID, _groupID)) {

            // Check minipool settings
            rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
            require(rocketMinipoolSettings.getMinipoolBackupCollectEnabled(), "Withdrawal from backup addresses is not currently allowed.");
            require(minipool.getStatus() == 4 && block.number >= (minipool.getStatusChangedBlock() + rocketMinipoolSettings.getMinipoolBackupCollectDuration()), "Withdrawal from backup addresses is not yet allowed by this minipool.");

            // Get user address; set user ID to backup withdrawal ID
            address userAddress = minipool.getUserAddressFromBackupAddress(_userID, _groupID);
            minipool.setUserIDToBackupWithdrawalID(userAddress, _groupID, _userID);

        }

        // Get user deposit amount
        uint256 userDepositAmount = minipool.getUserDeposit(_userID, _groupID);

        // Withdraw from minipool
        minipool.withdraw(_userID, _groupID, _withdrawerAddress);

        // Get amount withdrawn
        uint256 withdrawalAmount = rocketBETHToken.balanceOf(_withdrawerAddress).sub(initialBalance);

        // Update deposit details
        rocketDepositIndex = RocketDepositIndexInterface(getContractAddress("rocketDepositIndex"));
        rocketDepositIndex.withdrawFromMinipool(_depositID, _minipool, userDepositAmount);

        // Return withdrawn amount
        return withdrawalAmount;

    }


    // Set a backup withdrawal address for a minipool user
    function setMinipoolUserBackupWithdrawalAddress(address _userID, address _groupID, address _minipool, address _backupWithdrawalAddress) public onlyLatestContract("rocketDepositAPI", msg.sender) returns (bool) {

        // Get minipool contract
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipool);

        // Check user ID and backup withdrawal ID
        require(minipool.getUserExists(_userID, _groupID), "The user does not exist in the minipool");
        require(!minipool.getUserExists(_backupWithdrawalAddress, _groupID), "The backup withdrawal address is already in use by the minipool");
        require(!minipool.getUserBackupAddressExists(_backupWithdrawalAddress, _groupID), "The backup withdrawal address is already in use by the minipool");

        // Set backup withdrawal address
        minipool.setBackupWithdrawalAddress(_userID, _groupID, _backupWithdrawalAddress);

        // Success
        return true;

    }


    // Check if deposit details are valid
    // Ignores user ID if null
    function checkDepositDetails(address _userID, address _groupID, bytes32 _depositID, address _minipool) private {
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        require(rocketStorage.getBool(keccak256(abi.encodePacked("deposit.exists", _depositID))), "Deposit does not exist");
        if (_userID != address(0x0)) { require(rocketStorage.getAddress(keccak256(abi.encodePacked("deposit.userID", _depositID))) == _userID, "Incorrect deposit user ID"); }
        require(rocketStorage.getAddress(keccak256(abi.encodePacked("deposit.groupID", _depositID))) == _groupID, "Incorrect deposit group ID");
        require(addressSetStorage.getIndexOf(keccak256(abi.encodePacked("deposit.stakingPools", _depositID)), _minipool) != -1, "Deposit is not staking under minipool");
    }


}

