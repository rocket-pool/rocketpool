pragma solidity 0.5.0;


import "../../interface/token/ERC20.sol";
import "../../interface/RocketStorageInterface.sol";
import "../../interface/api/RocketDepositAPIInterface.sol";


/// @dev The contract for a default group accessor (depositor & withdrawer) implementation
/// @dev Allows any address to deposit to and withdraw from Rocket Pool through the group
/// @dev Must be manually assigned to the group as a depositor and withdrawer
/// @author Jake Pospischil

contract RocketGroupAccessorContract {


    /**** Properties *************/


    uint8 public version;                                                       // Version of this contract
    address public groupID;                                                     // The address of the associated group contract


    /*** Contracts ***************/


    RocketStorageInterface rocketStorage = RocketStorageInterface(0);           // The main Rocket Pool storage contract where primary persistant storage is maintained
    RocketDepositAPIInterface rocketDepositAPI = RocketDepositAPIInterface(0);  // The Rocket Pool Deposit API
    ERC20 rocketBETHToken = ERC20(0);


    /*** Constructor *************/


    /// @dev RocketGroupAccessorContract Constructor
    constructor(address _rocketStorageAddress, address _groupID) public {
        // Initialise properties
        version = 1;
        groupID = _groupID;
        // Initialise RocketStorage
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
    }


    /*** Public Methods **********/


    /// @dev Make a deposit through the Rocket Pool Deposit API
    /// @param _durationID The ID of the staking duration that the user wishes to stake for (3 months, 6 months etc)
    function deposit(string memory _durationID) public payable returns (bool) {
        // Get deposit API
        rocketDepositAPI = RocketDepositAPIInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketDepositAPI"))));
        // Perform deposit
        require(rocketDepositAPI.deposit.value(msg.value)(groupID, msg.sender, _durationID), "The deposit was not made successfully");
        // Return success flag
        return true;
    }


    /// @dev Refund a queued deposit through the Rocket Pool Deposit API
    /// @dev Refunded ether is sent to this contract's rocketpoolEtherDeposit method, then transferred to the user
    /// @param _durationID The ID of the staking duration of the deposit to refund
    /// @param _depositID The ID of the deposit to refund
    function refundDepositQueued(string memory _durationID, bytes32 _depositID) public returns (bool) {
        // Get deposit API
        rocketDepositAPI = RocketDepositAPIInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketDepositAPI"))));
        // Get balance before refund
        uint256 initialBalance = address(this).balance;
        // Perform refund
        uint256 amountRefunded = rocketDepositAPI.refundDepositQueued(groupID, msg.sender, _durationID, _depositID);
        require(amountRefunded > 0, "The deposit was not refunded successfully");
        require(amountRefunded == address(this).balance - initialBalance, "Amount refunded is incorrect");
        // Transfer ether to user
        (bool success,) = msg.sender.call.value(amountRefunded)("");
        require(success, "Unable to send refunded ether to user");
        // Return success flag
        return true;
    }


    /// @dev Refund a deposit fragment from a stalled minipool through the Rocket Pool Deposit API
    /// @dev Refunded ether is sent to this contract's rocketpoolEtherDeposit method, then transferred to the user
    /// @param _depositID The ID of the deposit to refund
    /// @param _minipool The address of the minipool to refund from
    function refundDepositMinipoolStalled(bytes32 _depositID, address _minipool) public returns (bool) {
        // Get deposit API
        rocketDepositAPI = RocketDepositAPIInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketDepositAPI"))));
        // Get balance before refund
        uint256 initialBalance = address(this).balance;
        // Perform refund
        uint256 amountRefunded = rocketDepositAPI.refundDepositMinipoolStalled(groupID, msg.sender, _depositID, _minipool);
        require(amountRefunded > 0, "The minipool deposit was not refunded successfully");
        require(amountRefunded == address(this).balance - initialBalance, "Amount refunded is incorrect");
        // Transfer ether to user
        (bool success,) = msg.sender.call.value(amountRefunded)("");
        require(success, "Unable to send refunded ether to user");
        // Return success flag
        return true;
    }


    /// @dev Withdraw some amount of a deposit fragment from a staking minipool as RPB tokens, forfeiting rewards for that amount, through the Rocket Pool Deposit API
    /// @dev Withdrawn RPB tokens are minted to this contract's address, then transferred to the user
    /// @param _depositID The ID of the deposit to withdraw from
    /// @param _minipool The address of the minipool to withdraw from
    /// @param _amount The amount of the deposit to withdraw as RPB tokens
    function withdrawDepositMinipoolStaking(bytes32 _depositID, address _minipool, uint256 _amount) public returns (bool) {
        // Check amount
        require(_amount > 0, "Invalid withdrawal amount");
        // Get contracts
        rocketDepositAPI = RocketDepositAPIInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketDepositAPI"))));
        rocketBETHToken = ERC20(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketBETHToken"))));
        // Get balance before withdrawal
        uint256 initialBalance = rocketBETHToken.balanceOf(address(this));
        // Perform withdrawal
        uint256 amountWithdrawn = rocketDepositAPI.withdrawDepositMinipoolStaking(groupID, msg.sender, _depositID, _minipool, _amount);
        require(amountWithdrawn > 0, "The minipool was not withdrawn from successfully");
        require(amountWithdrawn == rocketBETHToken.balanceOf(address(this)) - initialBalance, "Amount withdrawn is incorrect");
        // Transfer RPB tokens to user
        require(rocketBETHToken.transfer(msg.sender, amountWithdrawn), "Unable to send withdrawn RPB tokens to user");
        // Return success flag
        return true;
    }


    /// @dev Withdraw a deposit fragment from a withdrawn minipool as RPB tokens through the Rocket Pool Deposit API
    /// @dev Withdrawn RPB tokens are minted to this contract's address, then transferred to the user
    /// @param _depositID The ID of the deposit to withdraw
    /// @param _minipool The address of the minipool to withdraw from
    function withdrawDepositMinipool(bytes32 _depositID, address _minipool) public returns (bool) {
        // Get contracts
        rocketDepositAPI = RocketDepositAPIInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketDepositAPI"))));
        rocketBETHToken = ERC20(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketBETHToken"))));
        // Get balance before withdrawal
        uint256 initialBalance = rocketBETHToken.balanceOf(address(this));
        // Perform withdrawal
        uint256 amountWithdrawn = rocketDepositAPI.withdrawDepositMinipool(groupID, msg.sender, _depositID, _minipool);
        require(amountWithdrawn > 0, "The minipool deposit was not withdrawn successfully");
        require(amountWithdrawn == rocketBETHToken.balanceOf(address(this)) - initialBalance, "Amount withdrawn is incorrect");
        // Transfer RPB tokens to user
        require(rocketBETHToken.transfer(msg.sender, amountWithdrawn), "Unable to send withdrawn RPB tokens to user");
        // Return success flag
        return true;
    }


    /// @dev Set a backup withdrawal address for a deposit
    function setDepositBackupWithdrawalAddress(bytes32 _depositID, address _backupWithdrawalAddress) public returns (bool) {
        // Get contracts
        rocketDepositAPI = RocketDepositAPIInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketDepositAPI"))));
        // Set backup withdrawal address
        rocketDepositAPI.setDepositBackupWithdrawalAddress(groupID, msg.sender, _depositID, _backupWithdrawalAddress);
        // Return success flag
        return true;
    }


    /*** Rocket Pool Methods *****/


    /// @dev Receive an ether deposit from Rocket Pool
    function rocketpoolEtherDeposit() external payable returns (bool) {
        // Only callable by Rocket Pool contracts
        require(msg.sender == rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketDeposit"))), "Ether deposits can only be sent by Rocket Pool contracts");
        // Return success flag
        return true;
    }


}
