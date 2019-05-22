pragma solidity 0.5.8;


import "../../RocketBase.sol";
import "../../interface/api/RocketGroupAPIInterface.sol";
import "../../interface/deposit/RocketDepositInterface.sol";
import "../../interface/group/RocketGroupContractInterface.sol";
import "../../interface/settings/RocketDepositSettingsInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";


/// @title RocketDepositAPI - API for deposits into the Rocket Pool network
/// @author David Rugendyke

contract RocketDepositAPI is RocketBase {


    /*** Contracts **************/

    RocketGroupAPIInterface rocketGroupAPI = RocketGroupAPIInterface(0);                                            // The group contract for the API
    RocketDepositInterface rocketDeposit = RocketDepositInterface(0);                                               // Rocket Pool deposits contract
    RocketDepositSettingsInterface rocketDepositSettings = RocketDepositSettingsInterface(0);                       // The main settings contract for the API
    RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(0);                    // The main settings contract for minipools


    /*** Modifiers *************/

    /// @dev Only passes if the supplied minipool duration is valid
    /// @param _durationID The ID that determines the minipool duration
    modifier onlyValidDuration(string memory _durationID) {
        // Check to verify the supplied mini pool staking time id is legit, it will revert if not
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        rocketMinipoolSettings.getMinipoolStakingDuration(_durationID);
        _;
    }

  
    /*** Events ****************/

    event Deposit (
        address indexed _from,                                              // Address that sent the deposit, must be registered to the GroupID
        address indexed _userID,                                            // Address of the users account that owns the deposit
        address indexed _groupID,                                           // Group ID that controls the deposit
        bytes32 depositID,                                                  // The ID of the created deposit
        string  durationID,                                                 // The deposits staking duration ID
        uint256 value,                                                      // Amount in wei deposited
        uint256 created                                                     // Timestamp of the deposit
    );

    event DepositRefund (
        address indexed _to,
        address indexed _userID,
        address indexed _groupID,
        bytes32 depositID,
        uint256 value,
        uint256 created
    );

    event DepositWithdraw (
        address indexed _to,
        address indexed _userID,
        address indexed _groupID,
        bytes32 depositID,
        address minipool,
        uint256 value,
        uint256 created
    );

    event DepositSetBackupAddress (
        address indexed _from,
        address indexed _userID,
        address indexed _groupID,
        bytes32 depositID,
        address backupAddress
    );



    /*** Constructor *************/
   
    /// @dev constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }



    /*** Getters *************/

    /// @dev Checks if the deposit parameters are correct for a successful deposit
    /// @param _value The amount being deposited
    /// @param _from  The address sending the deposit
    /// @param _groupID The generated conract address for the group / 3rd party partner whom is in control of the supplid user account that the deposit belongs too
    /// @param _userID The address of the user whom the deposit belongs too
    /// @param _durationID The ID that determines which pool the user intends to join based on the staking blocks of that pool (3 months, 6 months etc)
    function checkDepositIsValid(uint256 _value, address _from, address _groupID, address _userID, string memory _durationID) private { 
        // Get contracts
        rocketDepositSettings = RocketDepositSettingsInterface(getContractAddress("rocketDepositSettings"));
        rocketGroupAPI = RocketGroupAPIInterface(getContractAddress("rocketGroupAPI"));
        // Deposits turned on?
        require(rocketDepositSettings.getDepositAllowed(), "Deposits are currently disabled.");
        // Is the deposit value acceptable?
        require(_value >= rocketDepositSettings.getDepositMin(), "Deposit value is less than the minimum allowed.");
        require(_value <= rocketDepositSettings.getCurrentDepositMax(_durationID), "Deposit value is more than the maximum allowed.");
        // Check addresses are correct
        require(address(_userID) != address(0x0), "UserID address is not a correct address");
        // Verify the groupID exists
        require(bytes(rocketGroupAPI.getGroupName(_groupID)).length > 0, "Group ID specified does not match a group name or does not exist");
        // Verify that _from is a depositor of the group
        RocketGroupContractInterface rocketGroup = RocketGroupContractInterface(_groupID);
        require(rocketGroup.hasDepositor(_from), "Group ID specified does not have a depositor matching the sender.");
    }


    /// @dev Checks if the refund parameters are correct for a successful deposit refund
    function checkDepositRefundIsValid(address _from, address _groupID, address _userID, bytes32 _depositID) private {
        // Get contracts
        rocketDepositSettings = RocketDepositSettingsInterface(getContractAddress("rocketDepositSettings"));
        rocketGroupAPI = RocketGroupAPIInterface(getContractAddress("rocketGroupAPI"));
        // Refunds turned on?
        require(rocketDepositSettings.getRefundDepositAllowed(), "Deposit refunds are currently disabled.");
        // Check addresses are correct
        require(address(_userID) != address(0x0), "UserID address is not a correct address");
        require(_depositID != 0x0, "Deposit ID is invalid");
        // Verify the groupID exists
        require(bytes(rocketGroupAPI.getGroupName(_groupID)).length > 0, "Group ID specified does not match a group name or does not exist");
        // Verify that _from is a depositor of the group
        RocketGroupContractInterface rocketGroup = RocketGroupContractInterface(_groupID);
        require(rocketGroup.hasDepositor(_from), "Group ID specified does not have a depositor matching the sender.");
    }


    /// @dev Checks if the withdrawal parameters are correct for a successful deposit withdrawal
    function checkDepositWithdrawalIsValid(address _from, address _groupID, address _userID, bytes32 _depositID) private {
        // Get contracts
        rocketDepositSettings = RocketDepositSettingsInterface(getContractAddress("rocketDepositSettings"));
        rocketGroupAPI = RocketGroupAPIInterface(getContractAddress("rocketGroupAPI"));
        // Withdrawals turned on?
        require(rocketDepositSettings.getWithdrawalAllowed(), "Deposit withdrawals are currently disabled.");
        // Check addresses are correct
        require(address(_userID) != address(0x0), "UserID address is not a correct address");
        require(_depositID != 0x0, "Deposit ID is invalid");
        // Verify the groupID exists
        require(bytes(rocketGroupAPI.getGroupName(_groupID)).length > 0, "Group ID specified does not match a group name or does not exist");
        // Verify that _from is a withdrawer of the group
        RocketGroupContractInterface rocketGroup = RocketGroupContractInterface(_groupID);
        require(rocketGroup.hasWithdrawer(_from), "Group ID specified does not have a withdrawer matching the sender.");
    }


    /// @dev Checks if the set backup address request parameters are correct
    function checkUserBackupWithdrawalAddressIsValid(address _from, address _groupID, address _userID, address _backupWithdrawalAddress) private {
        // Check addresses are correct
        require(address(_userID) != address(0x0), "UserID address is not a correct address");
        require(address(_backupWithdrawalAddress) != address(0x0), "Backup withdrawal address is not a correct address");
        require(_backupWithdrawalAddress != _userID, "Backup withdrawal address must not be the user ID");
        // Verify the groupID exists
        rocketGroupAPI = RocketGroupAPIInterface(getContractAddress("rocketGroupAPI"));
        require(bytes(rocketGroupAPI.getGroupName(_groupID)).length > 0, "Group ID specified does not match a group name or does not exist");
        // Verify that _from is a withdrawer of the group
        RocketGroupContractInterface rocketGroup = RocketGroupContractInterface(_groupID);
        require(rocketGroup.hasWithdrawer(_from), "Group ID specified does not have a withdrawer matching the sender.");
    }


    /*** Methods *************/

   
    /// @notice Send `msg.value ether` Eth from the account of `message.caller.address()`, to an account accessible only by Rocket Pool at `to.address()`.
    /// @dev Deposit to Rocket Pool, can be from a user or a partner on behalf of their user
    /// @param _groupID The ID of the group / 3rd party partner contract whom is in control of the supplid user account that the deposit belongs too
    /// @param _userID The address of the user whom the deposit belongs too
    /// @param _durationID The ID that determines which pool the user intends to join based on the staking blocks of that pool (3 months, 6 months etc)
    function deposit(address _groupID, address _userID, string memory _durationID) public payable onlyLatestContract("rocketDepositAPI", address(this)) onlyValidDuration(_durationID) returns(bool) { 
        // Verify the deposit is acceptable
        checkDepositIsValid(msg.value, msg.sender, _groupID, _userID, _durationID);
        // Send and create deposit
        rocketDeposit = RocketDepositInterface(getContractAddress("rocketDeposit"));
        bytes32 depositID = rocketDeposit.create.value(msg.value)(_userID, _groupID, _durationID);
        require(depositID != 0x0, "Deposit could not be created");
        // All good? Fire the event for the new deposit
        emit Deposit(msg.sender, _userID, _groupID, depositID, _durationID, msg.value, now);   
        // Done
        return true;
    }


    /// @dev Refund a queued deposit to Rocket Pool
    /// @param _groupID The ID of the group in control of the deposit
    /// @param _userID The address of the user who the deposit belongs to
    /// @param _durationID The ID of the deposit's staking duration
    /// @param _depositID The ID of the deposit to refund
    function refundDepositQueued(address _groupID, address _userID, string memory _durationID, bytes32 _depositID) public onlyLatestContract("rocketDepositAPI", address(this)) onlyValidDuration(_durationID) returns(uint256) {
        // Verify the refund is acceptable
        checkDepositRefundIsValid(msg.sender, _groupID, _userID, _depositID);
        // Refund deposit
        rocketDeposit = RocketDepositInterface(getContractAddress("rocketDeposit"));
        uint256 amountRefunded = rocketDeposit.refund(_userID, _groupID, _durationID, _depositID, msg.sender);
        require(amountRefunded > 0, "Deposit could not be refunded");
        // All good? Fire the event for the refund
        emit DepositRefund(msg.sender, _userID, _groupID, _depositID, amountRefunded, now);
        // Return refunded amount
        return amountRefunded;
    }


    /// @dev Refund a deposit fragment from a stalled minipool
    /// @param _groupID The ID of the group in control of the deposit
    /// @param _userID The address of the user who the deposit belongs to
    /// @param _depositID The ID of the deposit to refund
    /// @param _minipool The address of the minipool to refund from
    function refundDepositMinipoolStalled(address _groupID, address _userID, bytes32 _depositID, address _minipool) public onlyLatestContract("rocketDepositAPI", address(this)) returns(uint256) {
        // Verify the refund is acceptable
        checkDepositRefundIsValid(msg.sender, _groupID, _userID, _depositID);
        // Refund deposit
        rocketDeposit = RocketDepositInterface(getContractAddress("rocketDeposit"));
        uint256 amountRefunded = rocketDeposit.refundFromStalledMinipool(_userID, _groupID, _depositID, _minipool, msg.sender);
        require(amountRefunded > 0, "Minipool deposit could not be refunded");
        // All good? Fire the event for the refund
        emit DepositRefund(msg.sender, _userID, _groupID, _depositID, amountRefunded, now);
        // Return refunded amount
        return amountRefunded;
    }


    /// @dev Withdraw some amount of a deposit fragment from a staking minipool as RPB tokens, forfeiting rewards for that amount
    /// @param _groupID The ID of the group in control of the deposit
    /// @param _userID The address of the user who the deposit belongs to
    /// @param _depositID The ID of the deposit to withdraw
    /// @param _minipool The address of the minipool to withdraw from
    /// @param _amount The amount of the deposit to withdraw as RPB tokens
    function withdrawDepositMinipoolStaking(address _groupID, address _userID, bytes32 _depositID, address _minipool, uint256 _amount) public onlyLatestContract("rocketDepositAPI", address(this)) returns(uint256) {
        // Verify the withdrawal is acceptable
        checkDepositWithdrawalIsValid(msg.sender, _groupID, _userID, _depositID);
        // Withdraw deposit amount as RPB tokens
        rocketDeposit = RocketDepositInterface(getContractAddress("rocketDeposit"));
        uint256 amountWithdrawn = rocketDeposit.withdrawFromStakingMinipool(_userID, _groupID, _depositID, _minipool, _amount, msg.sender);
        require(amountWithdrawn > 0, "Minipool deposit amount could not be withdrawn");
        // All good? Fire the event for the withdrawal
        emit DepositWithdraw(msg.sender, _userID, _groupID, _depositID, _minipool, amountWithdrawn, now);
        // Return withdrawn amount
        return amountWithdrawn;
    }


    /// @dev Withdraw a deposit fragment from a withdrawn minipool as RPB tokens
    /// @param _groupID The ID of the group in control of the deposit
    /// @param _userID The address of the user who the deposit belongs to
    /// @param _depositID The ID of the deposit to withdraw
    /// @param _minipool The address of the minipool to withdraw from
    function withdrawDepositMinipool(address _groupID, address _userID, bytes32 _depositID, address _minipool) public onlyLatestContract("rocketDepositAPI", address(this)) returns(uint256) {
        // Verify the withdrawal is acceptable
        checkDepositWithdrawalIsValid(msg.sender, _groupID, _userID, _depositID);
        // Withdraw deposit as RPB tokens
        rocketDeposit = RocketDepositInterface(getContractAddress("rocketDeposit"));
        uint256 amountWithdrawn = rocketDeposit.withdrawFromWithdrawnMinipool(_userID, _groupID, _depositID, _minipool, msg.sender);
        require(amountWithdrawn > 0, "Minipool deposit could not be withdrawn");
        // All good? Fire the event for the withdrawal
        emit DepositWithdraw(msg.sender, _userID, _groupID, _depositID, _minipool, amountWithdrawn, now);
        // Return withdrawn amount
        return amountWithdrawn;
    }


    /// @dev Set a backup withdrawal address for a deposit
    function setDepositBackupWithdrawalAddress(address _groupID, address _userID, bytes32 _depositID, address _backupWithdrawalAddress) public onlyLatestContract("rocketDepositAPI", address(this)) returns(bool) {
        // Verify the set backup address request is acceptable
        checkUserBackupWithdrawalAddressIsValid(msg.sender, _groupID, _userID, _backupWithdrawalAddress);
        // Set backup withdrawal address
        rocketDeposit = RocketDepositInterface(getContractAddress("rocketDeposit"));
        rocketDeposit.setDepositBackupWithdrawalAddress(_userID, _groupID, _depositID, _backupWithdrawalAddress);
        // All good? Fire the event for the backup address getting set
        emit DepositSetBackupAddress(msg.sender, _userID, _groupID, _depositID, _backupWithdrawalAddress);
        // Success
        return true;
    }


}
