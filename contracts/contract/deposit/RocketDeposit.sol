pragma solidity 0.5.0;


import "../../RocketBase.sol";
import "../../interface/deposit/RocketDepositQueueInterface.sol";
import "../../interface/deposit/RocketDepositVaultInterface.sol";
import "../../interface/group/RocketGroupAccessorContractInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/settings/RocketDepositSettingsInterface.sol";
import "../../interface/token/RocketBETHTokenInterface.sol";
import "../../interface/utils/lists/AddressSetStorageInterface.sol";
import "../../interface/utils/lists/Bytes32SetStorageInterface.sol";
import "../../lib/SafeMath.sol";


/// @title RocketDeposit - manages deposits into the Rocket Pool network
/// @author Jake Pospischil

contract RocketDeposit is RocketBase {


    /*** Libs  ******************/


    using SafeMath for uint256;


    /**** Properties ************/


    uint256 private calcBase = 1 ether;


    /*** Contracts **************/


    RocketDepositQueueInterface rocketDepositQueue = RocketDepositQueueInterface(0);
    RocketDepositVaultInterface rocketDepositVault = RocketDepositVaultInterface(0);
    RocketDepositSettingsInterface rocketDepositSettings = RocketDepositSettingsInterface(0);
    RocketBETHTokenInterface rocketBETHToken = RocketBETHTokenInterface(0);
    AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(0);
    Bytes32SetStorageInterface bytes32SetStorage = Bytes32SetStorageInterface(0);


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
        bytes32 depositID = add(_userID, _groupID, _durationID, msg.value);

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
        rocketStorage.setUint(keccak256(abi.encodePacked("deposit.queuedAmount", _depositID)), 0);
        rocketStorage.setUint(keccak256(abi.encodePacked("deposit.refundedAmount", _depositID)), refundAmount);

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

        // Update deposit pool details
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        addressSetStorage.removeItem(keccak256(abi.encodePacked("deposit.stakingPools", _depositID)), _minipool);
        rocketStorage.setUint(keccak256(abi.encodePacked("deposit.stakingPoolAmount", _depositID, _minipool)), 0);

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

        // Update deposit pool details
        if (!minipool.getUserHasDeposit(_userID, _groupID)) { addressSetStorage.removeItem(keccak256(abi.encodePacked("deposit.stakingPools", _depositID)), _minipool); }
        uint256 stakingPoolAmount = rocketStorage.getUint(keccak256(abi.encodePacked("deposit.stakingPoolAmount", _depositID, _minipool)));
        rocketStorage.setUint(keccak256(abi.encodePacked("deposit.stakingPoolAmount", _depositID, _minipool)), stakingPoolAmount.sub(_amount));

        // Return token amount withdrawn
        return tokenAmount;

    }


    // Withdraw a deposit fragment from a withdrawn minipool as RPB tokens
    function withdrawFromWithdrawnMinipool(address _userID, address _groupID, bytes32 _depositID, address _minipool, address _withdrawerAddress) public onlyLatestContract("rocketDepositAPI", msg.sender) returns (uint256) {

        // Check deposit details
        checkDepositDetails(_userID, _groupID, _depositID, _minipool);

        // Get initial withdrawer address balance
        rocketBETHToken = RocketBETHTokenInterface(getContractAddress("rocketBETHToken"));
        uint256 initialBalance = rocketBETHToken.balanceOf(_withdrawerAddress);

        // Get minipool user balance & withdraw deposit from minipool
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipool);
        minipool.withdraw(_userID, _groupID, _withdrawerAddress);

        // Get amount withdrawn
        uint256 withdrawalAmount = rocketBETHToken.balanceOf(_withdrawerAddress).sub(initialBalance);

        // Update deposit pool details
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        addressSetStorage.removeItem(keccak256(abi.encodePacked("deposit.stakingPools", _depositID)), _minipool);
        rocketStorage.setUint(keccak256(abi.encodePacked("deposit.stakingPoolAmount", _depositID, _minipool)), 0);

        // Return withdrawn amount
        return withdrawalAmount;

    }


    // Check deposit details are valid
    function checkDepositDetails(address _userID, address _groupID, bytes32 _depositID, address _minipool) private {
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        require(rocketStorage.getBool(keccak256(abi.encodePacked("deposit.exists", _depositID))), "Deposit does not exist");
        require(rocketStorage.getAddress(keccak256(abi.encodePacked("deposit.userID", _depositID))) == _userID, "Incorrect deposit user ID");
        require(rocketStorage.getAddress(keccak256(abi.encodePacked("deposit.groupID", _depositID))) == _groupID, "Incorrect deposit group ID");
        require(addressSetStorage.getIndexOf(keccak256(abi.encodePacked("deposit.stakingPools", _depositID)), _minipool) != -1, "Deposit is not staking under minipool");
    }


    // Add a deposit
    // Returns the new deposit ID
    function add(address _userID, address _groupID, string memory _durationID, uint256 _amount) private returns (bytes32) {

        // Get user deposit nonce
        uint depositIDNonce = rocketStorage.getUint(keccak256(abi.encodePacked("user.deposit.nonce", _userID, _groupID, _durationID))).add(1);
        rocketStorage.setUint(keccak256(abi.encodePacked("user.deposit.nonce", _userID, _groupID, _durationID)), depositIDNonce);

        // Get deposit ID
        bytes32 depositID = keccak256(abi.encodePacked("deposit", _userID, _groupID, _durationID, depositIDNonce));
        require(!rocketStorage.getBool(keccak256(abi.encodePacked("deposit.exists", depositID))), "Deposit ID already in use");

        // Set deposit details
        rocketStorage.setBool(keccak256(abi.encodePacked("deposit.exists", depositID)), true);
        rocketStorage.setAddress(keccak256(abi.encodePacked("deposit.userID", depositID)), _userID);
        rocketStorage.setAddress(keccak256(abi.encodePacked("deposit.groupID", depositID)), _groupID);
        rocketStorage.setString(keccak256(abi.encodePacked("deposit.stakingDurationID", depositID)), _durationID);
        rocketStorage.setUint(keccak256(abi.encodePacked("deposit.totalAmount", depositID)), _amount);
        rocketStorage.setUint(keccak256(abi.encodePacked("deposit.queuedAmount", depositID)), _amount);
        // + stakingAmount
        // + stakingPools
        // + stakingPoolAmount
        // + refundedAmount

        // Update deposit indexes
        bytes32SetStorage = Bytes32SetStorageInterface(getContractAddress("utilBytes32SetStorage"));
        bytes32SetStorage.addItem(keccak256(abi.encodePacked("user.deposits", _userID, _groupID, _durationID)), depositID);

        // Return ID
        return depositID;

    }


}

