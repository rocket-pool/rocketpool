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
        bytes32 indexed _account,
        uint256 value,
        uint256 index,
        uint256 created
    );

    event Withdrawal (
        address indexed _to,
        bytes32 indexed _account,
        uint256 value,
        uint256 index,
        uint256 created
    );


    /*** Modifiers *************/


    /// @dev Only allow access from the owner of that account
    modifier onlyAccountOwner(bytes32 _account) {
        // Check it's the account owner or the top level owner
        require(rocketStorage.getAddress(keccak256("vault.account.owner", _account)) == msg.sender || roleHas("owner", msg.sender) == true);
        _;
    } 


    /*** Constructor ***********/    

    /// @dev RocketVault constructor
    function RocketVault(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Set the version
        version = 1;
    }


    /**** Methods ***********/


    /// @dev Deposits to RocketVault can be of ether or tokens
    /// @param _account The name of an existing account in RocketVault
    /// @param _amount The amount being deposited in RocketVault
    function deposit(bytes32 _account, uint256 _amount) payable external returns(uint256) {
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
        acceptableDeposit(_account, deposit);
        // Get how many individual deposits in this account we currently have  
        uint256 depositNumber = rocketStorage.getUint(keccak256("vault.account.deposits.total", _account)); 
        // Deposit into the account and keep track of its balance
        rocketStorage.setUint(keccak256("vault.account.balance", _account), rocketStorage.getUint(keccak256("vault.account.balance", _account)).add(deposit));
        // Record the deposit amount
        rocketStorage.setUint(keccak256("vault.account.deposit.amount", _account, depositNumber), deposit);
        // Record who made the deposit
        rocketStorage.setAddress(keccak256("vault.account.deposit.address", _account, depositNumber), msg.sender);
        // Record the time
        rocketStorage.setUint(keccak256("vault.account.deposit.time", _account, depositNumber), now);
        // Update total deposits made into this account
        rocketStorage.setUint(keccak256("vault.account.deposits.total", _account), depositNumber + 1);
        // Log it
        Deposit(msg.sender, _account, deposit, depositNumber, now);
        // Return the current deposit number
        return depositNumber;
    }

    /// @param _account The name of an existing account in RocketVault
    /// @param _amount The amount being withdrawn in RocketVault
    /// @param _withdrawalAddress The address to withdraw too
    function withdraw(bytes32 _account, uint256 _amount, address _withdrawalAddress) external returns(uint256) {
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
        // Update total withdrawals made from this account
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
    function acceptableDeposit(bytes32 _account, uint256 _amount) private {
        rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        // Check deposits are allowed currently and that the deposit sender is registered to deposit
        require(_amount > 0);
        require(rocketSettings.getVaultDepositAllowed());
        require(rocketStorage.getBool(keccak256("vault.account.deposit.enabled", _account)) == true);
        require(rocketStorage.getBool(keccak256("vault.account.deposit.allowed", _account, msg.sender)) == true); 
        require(rocketStorage.getAddress(keccak256("vault.account.owner", _account)) != 0x0); 
    }

    /// @dev User withdrawals must be validated
    /// @param _account The name of an existing account in RocketVault
    /// @param _amount The amount to withdraw from RocketVault
    /// @param _withdrawalAddress The address to withdraw too
    function acceptableWithdrawal(bytes32 _account, uint256 _amount, address _withdrawalAddress) private {
        rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        // Check withdrawals are allowed currently and that the deposit sender is registered to withdraw
        require(_amount > 0);
        require(_withdrawalAddress != 0x0);
        require(rocketSettings.getVaultWithdrawalAllowed());
        require(rocketStorage.getBool(keccak256("vault.account.withdrawal.enabled", _account)) == true);
        require(rocketStorage.getBool(keccak256("vault.account.withdrawal.allowed", _account, msg.sender)) == true); 
        require(rocketStorage.getAddress(keccak256("vault.account.owner", _account)) != 0x0); 
        require(rocketStorage.getUint(keccak256("vault.account.balance", _account)).sub(_amount) >= 0);
    }

    /// @dev Checks whether the sending address can deposit into an account
    /// @param _account The name of the account to check
    function canDeposit(bytes32 _account) external view returns (bool) {
        return (
            rocketStorage.getBool(keccak256("settings.vault.deposit.allowed")) && // Vault deposits enabled (not using rocketSettings to keep method pure)
            rocketStorage.getBool(keccak256("vault.account.deposit.enabled", _account)) && // Account deposits enabled
            rocketStorage.getBool(keccak256("vault.account.deposit.allowed", _account, msg.sender)) && // Sender allowed to deposit into account
            rocketStorage.getAddress(keccak256("vault.account.owner", _account)) != 0x0 // Account exists (has owner)
        );
    }

    /// @dev Checks whether the sending address can withdraw from an account
    /// @param _account The name of the account to check
    function canWithdraw(bytes32 _account) external view returns (bool) {
        return (
            rocketStorage.getBool(keccak256("settings.vault.withdrawal.allowed")) && // Vault withdrawals enabled (not using rocketSettings to keep method pure)
            rocketStorage.getBool(keccak256("vault.account.withdrawal.enabled", _account)) && // Account withdrawals enabled
            rocketStorage.getBool(keccak256("vault.account.withdrawal.allowed", _account, msg.sender)) && // Sender allowed to withdraw from account
            rocketStorage.getAddress(keccak256("vault.account.owner", _account)) != 0x0 // Account exists (has owner)
        );
    }

    /// @dev Check the balance of an account (returns 0 for nonexistent accounts)
    /// @param _account The name of the account to check the balance of
    function getBalance(bytes32 _account) external view returns (uint256) {
        return rocketStorage.getUint(keccak256("vault.account.balance", _account));
    }


    /*** Setters **************/

    /// @dev Creates a new vault account that can accept deposits
    /// @param _account The name of the account to set in RocketVault
    /// @param _tokenAddress If this account represents a vault for an ERC20 token, this is its contract address
    function setAccountAdd(bytes32 _account, address _tokenAddress) external onlySuperUser {
        // Check the account name is valid
        require(_account != 0x0);
        // Check it doesn't already exist
        require(rocketStorage.getAddress(keccak256("vault.account.owner", _account)) == 0x0); 
        // Check the balance is 0
        require(rocketStorage.getUint(keccak256("vault.account.balance", _account)) == 0);
        // Ok good to go
        // TODO: check if this key is necessary
        //rocketStorage.setString(keccak256("vault.account", _account), _account);
        rocketStorage.setAddress(keccak256("vault.account.owner", _account), msg.sender); 
        rocketStorage.setBool(keccak256("vault.account.deposit.enabled", _account), true);
        rocketStorage.setBool(keccak256("vault.account.deposit.allowed", _account, msg.sender), true);
        rocketStorage.setBool(keccak256("vault.account.withdrawal.enabled", _account), true);
        rocketStorage.setBool(keccak256("vault.account.withdrawal.allowed", _account, msg.sender), true);
        // Are we storing a token address for this account?
        if (_tokenAddress != 0x0) {
            rocketStorage.setAddress(keccak256("vault.account.token.address", _account), _tokenAddress); 
        }
    }

    /// @dev Returns whether an account's deposits are enabled (true) or disabled (false)
    /// @param _account The name of the account to test whether deposits are enabled or disabled
    function getAccountDepositsEnabled(bytes32 _account) external view returns(bool) {
        return rocketStorage.getBool(keccak256("vault.account.deposit.enabled", _account));
    }

    /// @dev Disable/Enable a vault account's deposits, only the owner of that account or top level owner can do this
    /// @param _account The name of the account to disable/enable deposits for in RocketVault
    function setAccountDepositsEnabled(bytes32 _account, bool _option) onlyAccountOwner(_account) external {
        // Ok set the option now
        rocketStorage.setBool(keccak256("vault.account.deposit.enabled", _account), _option);
    }

    /// @dev Returns whether an account's deposits are allowed (true) or disallowed (false)
    /// @param _account The name of the account
    /// @param _address The address to test whether deposits are allowed or disallowed for
    function getAccountDepositsAllowed(bytes32 _account, address _address) external view returns(bool) {
        return rocketStorage.getBool(keccak256("vault.account.deposit.allowed", _account, _address));
    }

    /// @dev Allow/Disallow a vault account's deposits for an address, only the owner of that account or top level owner can do this
    /// @param _account The name of the account
    /// @param _address The address to allow/disallow deposits for
    function setAccountDepositsAllowed(bytes32 _account, address _address, bool _option) onlyAccountOwner(_account) external {
        rocketStorage.setBool(keccak256("vault.account.deposit.allowed", _account, _address), _option);
    }

    /// @dev Returns whether an account's withdrawals are enabled (true) or disabled (false)
    /// @param _account The name of the account to test whether withdrawals are enabled or disabled
    function getAccountWithdrawalsEnabled(bytes32 _account) external view returns(bool) {
        return rocketStorage.getBool(keccak256("vault.account.withdrawal.enabled", _account));
    }

    /// @dev Disable/Enable a vault account's withdrawals, only the owner of that account or top level owner can do this
    /// @param _account The name of the account to disable/enable deposits for in RocketVault
    function setAccountWithdrawalsEnabled(bytes32 _account, bool _option) onlyAccountOwner(_account) external {
        // Ok set the option now
        rocketStorage.setBool(keccak256("vault.account.withdrawal.enabled", _account), _option);
    }

    /// @dev Returns whether an account's withdrawals are allowed (true) or disallowed (false)
    /// @param _account The name of the account
    /// @param _address The address to test whether withdrawals are allowed or disallowed for
    function getAccountWithdrawalsAllowed(bytes32 _account, address _address) external view returns(bool) {
        return rocketStorage.getBool(keccak256("vault.account.withdrawal.allowed", _account, _address));
    }

    /// @dev Allow/Disallow a vault account's withdrawals for an address, only the owner of that account or top level owner can do this
    /// @param _account The name of the account
    /// @param _address The address to allow/disallow withdrawals for
    function setAccountWithdrawalsAllowed(bytes32 _account, address _address, bool _option) onlyAccountOwner(_account) external {
        rocketStorage.setBool(keccak256("vault.account.withdrawal.allowed", _account, _address), _option);
    }


}
