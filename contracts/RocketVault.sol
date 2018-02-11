pragma solidity 0.4.19;


import "./RocketBase.sol";
import "./RocketStorage.sol";
import "./interface/ERC20.sol";
import "./interface/RocketSettingsInterface.sol";
import "./lib/SafeMath.sol";


/// @title Ether/Tokens held by Rocket Pool are stored here in the vault for safe keeping
/// @author David Rugendyke
 // TODO: Add in deposits/withdrawals for RPL tokens
 // TODO: Add in an upgrade method that will allow the balance and tokens to be transferred to a new RocketVault contract, but only if it matches the current 'contract.name' == RocketVault in storage
contract RocketVault is RocketBase {


    /**** Libs *****************/
    
    using SafeMath for uint;


    /*** Contracts **************/

    ERC20 tokenContract = ERC20(0);                                             // The address of an ERC20 token contract
    RocketSettingsInterface rocketSettings = RocketSettingsInterface(0);        // The main settings contract most global parameters are maintained


    /*** Events ****************/

    event Deposit (
        address indexed _from,
         string indexed _account,
        uint256 value,
        uint256 index,
        uint256 created
    );

    event Withdrawal (
        address indexed _to,
         string indexed _account,
        uint256 value,
        uint256 index,
        uint256 created
    );



    /*** Constructor ***********/    

    /// @dev RocketVault constructor
    function RocketVault() public {
        // Set the version
        version = 1;
    }


    /**** Methods ***********/

    /// @dev Deposits to RocketVault can be of ether or tokens
    /// @param _account The name of an existing account in RocketVault
    /// @param _amount The amount being deposited in RocketVault
    function deposit(string _account, uint256 _amount) payable external returns(uint256) {
        // Actual amount to deposit
        uint256 deposit = 0;
        // Determine how much is being deposited based on the account type, can be either ether or tokens
        if (rocketStorage.getAddress(keccak256("vault.account.token.address", _account)) == 0x0) {
            // Capture the amount of ether sent
            deposit = msg.value;
        } else {
            // Transfer the tokens from the users account, user must initiate this transaction so we know exactly how many tokens we received
            tokenContract = ERC20(rocketStorage.getAddress(keccak256("vault.account.token.address", _account)));
            // Send them to Rocket Vault now
            require(tokenContract.transfer(address(this), _amount) == true);
            // Set the amount now
            deposit = _amount;
        }
        // Verify deposit is ok based on the account type and exact values transferred to the vault, throws if not
        acceptableDeposit(_account, _amount);
        // Get how many individual deposits in this account we currently have  
        uint256 depositNumber = rocketStorage.getUint(keccak256("vault.account.deposits.total", _account)); 
        // Deposit into the account and keep track of its balance
        rocketStorage.setUint(keccak256("vault.account.balance", _account), rocketStorage.getUint(keccak256("vault.account.balance", _account)).add(msg.value));
        // Record the deposit amount
        rocketStorage.setUint(keccak256("vault.account.deposit.amount", _account, depositNumber), msg.value);
        // Record who made the deposit
        rocketStorage.setAddress(keccak256("vault.account.deposit.address", _account, depositNumber), msg.sender);
        // Record the time
        rocketStorage.setUint(keccak256("vault.account.deposit.time", _account, depositNumber), now);
        // Update total deposits made into this account
        rocketStorage.setUint(keccak256("vault.account.deposits.total", _account), depositNumber + 1);
        // Log it
        Deposit(msg.sender, _account, msg.value, depositNumber, now);
        // Return the current deposit number
        return depositNumber;
    }

    /// @param _account The name of an existing account in RocketVault
    /// @param _amount The amount being withdrawn in RocketVault
    /// @param _withdrawalAddress The address to withdraw too
    function withdrawal(string _account, uint256 _amount, address _withdrawalAddress) external returns(uint256) {
        // Verify withdrawal is ok based on the account type and exact values transferred to the vault, throws if not
        acceptableWithdrawal(_account, _amount, _withdrawalAddress);
        // Get how many individual withdrawals in this account we currently have  
        uint256 withdrawalNumber = rocketStorage.getUint(keccak256("vault.account.withdrawals.total", _account)); 
        // Withdrawals from the account and keep track of its balance
        rocketStorage.setUint(keccak256("vault.account.balance", _account), rocketStorage.getUint(keccak256("vault.account.balance", _account)).sub(_amount));
        // Record the withdrawal amount
        rocketStorage.setUint(keccak256("vault.account.withdrawal.amount", _account, withdrawalNumber), _amount);
        // Record who made the withdrawal
        rocketStorage.setAddress(keccak256("vault.account.withdrawal.address", _account, withdrawalNumber), msg.sender);
        // Record the time
        rocketStorage.setUint(keccak256("vault.account.withdrawal.time", _account, withdrawalNumber), now);
        // Update total deposits made into this account
        rocketStorage.setUint(keccak256("vault.account.withdrawal.total", _account), withdrawalNumber + 1);
        // Are we transferring ether or tokens?
        if (rocketStorage.getAddress(keccak256("vault.account.token.address", _account)) == 0x0) {
            // Transfer the withdrawal amount to the sender
            _withdrawalAddress.transfer(_amount);
        } else {
            // Transfer the tokens from our Vault contract account
            tokenContract = ERC20(rocketStorage.getAddress(keccak256("vault.account.token.address", _account)));
            // Send them from Rocket Vault now
            require(tokenContract.transfer(_withdrawalAddress, _amount) == true);
        }
        // Log it
        Withdrawal(msg.sender, _account, _amount, withdrawalNumber, now);
        // Return the current withdrawal number
        return withdrawalNumber;
    }

    /// @dev Deposits must be validated
    /// @param _account The name of an existing account in RocketVault
    /// @param _amount The amount to deposit in RocketVault
    function acceptableDeposit(string _account, uint256 _amount) private {
        rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        // Check deposits are allowed currently and that the deposit sender is registered to deposit
        require(_amount > 0);
        require(rocketSettings.getVaultDepositAllowed());
        require(rocketStorage.getBool(keccak256("vault.account.deposit.allowed", msg.sender)) == true); 
        require(rocketStorage.getAddress(keccak256("vault.account", _account)) != 0x0); 
    }

    /// @dev User withdrawals must be validated
    /// @param _account The name of an existing account in RocketVault
    /// @param _amount The amount to withdraw from RocketVault
    /// @param _withdrawalAddress The address to withdraw too
    function acceptableWithdrawal(string _account, uint256 _amount, address _withdrawalAddress) private {
        rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        // Check withdrawals are allowed currently and that the deposit sender is registered to withdraw
        require(_amount > 0);
        require(_withdrawalAddress != 0x0);
        require(rocketSettings.getVaultWithdrawalAllowed());
        require(rocketStorage.getBool(keccak256("vault.account.withdrawal.allowed", msg.sender)) == true); 
        require(rocketStorage.getAddress(keccak256("vault.account", _account)) != 0x0); 
        require(rocketStorage.getUint(keccak256("vault.account.balance", _account)).sub(_amount) >= 0);
    }


}
