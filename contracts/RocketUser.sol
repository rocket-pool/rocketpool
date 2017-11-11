pragma solidity 0.4.18;

import "./contract/Owned.sol";
import "./RocketPoolMini.sol"; 
import "./RocketDepositToken.sol"; 
import "./interface/RocketStorageInterface.sol";
import "./interface/RocketSettingsInterface.sol";
import "./interface/RocketPoolInterface.sol";


/// @title Rocket Pool Users
/// @author David Rugendyke

contract RocketUser is Owned {


    /**** Properties ************/

    uint256 public version;                                                // Version of this contract


    /*** Contracts **************/

    RocketPoolMini rocketPoolMini = RocketPoolMini(0);                    // The mini pool contract
    RocketPoolInterface rocketPool = RocketPoolInterface(0);              // The main pool contract
    RocketStorageInterface rocketStorage = RocketStorageInterface(0);     // The main storage contract where primary persistant storage is maintained  
    RocketSettingsInterface rocketSettings = RocketSettingsInterface(0);  // The main settings contract most global parameters are maintained
  

    /*** Events ****************/

    event UserDeposit (
        address indexed _from,
        string  poolStakingTimeID,
        uint256 value,
        uint256 created
    );

    event UserAddedToPool (
        address indexed _userAddress,
        address indexed _partnerAddress,
        address indexed _pool,
        uint256 created 
    );

    event UserSetBackupWithdrawalAddress (
        address indexed _userAddress,
        address indexed _userBackupAddress,
        address indexed _pool,
        uint256 created 
    );

    event UserChangedToWithdrawalAddress (
        address indexed _userAddress,
        address indexed _userNewAddress,
        address indexed _pool,
        uint256 created 
    );

	
    event DepositTokensWithdrawal (
        address indexed _userAddress,
        uint256 amount,
        uint256 tokenAmount,
        uint256 created
    );

       

    /*** Modifiers *************/

    /// @dev Only allow access from the latest version of the RocketPool contract
    modifier onlyLatestRocketPool() {
        assert(this == rocketStorage.getAddress(keccak256("contract.name", "rocketPool")));
        _;
    }


    /*** Constructor *************/
   
    /// @dev rocketUser constructor
    function RocketUser(address _rocketStorageAddress) public { 
        // Update the contract address 
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
    }

    

    /*** Methods *************/


    /// @notice Send `msg.value ether` Eth from the account of `message.caller.address()`, to an account accessible only by Rocket Pool at `to.address()`.
    /// @dev Fallback function, user direct deposit to Rocket Pool 
    function deposit(string _poolStakingTimeID) public payable {   
        // Get our settings first
        rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        // Our main contract handles the deposit
        rocketPool = RocketPoolInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketPool")));
        // Direct deposit to Rocket Pool, set partner address to 0 to indicate no partner but an awesome direct Rocket Pool user
        // Make the deposit now and validate it - needs a lot of gas to cover potential minipool creation for this user (if throw errors start appearing, increase/decrease gas to cover the changes in the minipool)
        if (rocketPool.deposit.value(msg.value).gas(rocketSettings.getPoolMiniCreationGas())(msg.sender, 0,  "default")) {
            // Fire the event now
            UserDeposit(msg.sender, _partnerUserAddress, _poolStakingTimeID, msg.value, now);
        }
    }

    // TODO: Figure out where to add the withdraw method
    
    /// @notice Withdraw ether from Rocket Pool
    /// @dev A regular Rocket Pool user withdrawing their deposit
    /// @param miniPoolAddress The address of the mini pool they wish to withdraw from.
    /// @param amount The amount in Wei to withdraw, passing 0 will withdraw the users whole balance.
    function userWithdrawDeposit(address _miniPoolAddress, uint256 _amount) external returns(bool) {
        // Call our transfer method, creates a transaction
        return userWithdrawDepositFromPoolTransfer(msg.sender, _miniPoolAddress, _amount, 0);
    }

    /// @notice Withdraw ether from Rocket Pool via a 3rd party partner
    /// @dev A Rocket Pool 3rd party partner withdrawing their users deposit
    /// @param miniPoolAddress The address of the mini pool they wish to withdraw from.
    /// @param amount The amount in Wei to withdraw, passing 0 will withdraw the users whole balance.
    function userPartnerWithdrawDeposit(address miniPoolAddress, uint256 amount, address partnerUserAddress, address partnerAddress) public onlyLatestRocketPartnerAPI returns(bool) {
        // Call our transfer method, creates a transaction
        return userWithdrawDepositFromPoolTransfer(partnerUserAddress, miniPoolAddress, amount, partnerAddress);
    }

    /// @dev User has requested withdrawing their deposit from a pool, all main checks are done here as this contract is upgradable, but mini pools are not.
    /// @param userAddress The address to use for withdrawals, can also be a partners users address withdrawing on behalf of their user
    /// @param miniPoolAddress The address of the mini pool they wish to withdraw from.
    /// @param amount The amount in Wei to withdraw, passing 0 will withdraw the users whole balance.
    /// @param partnerAddress The address of the partner 
    function userWithdrawDepositFromPoolTransfer(address userAddress, address miniPoolAddress, uint256 amount, address partnerAddress) private acceptableWithdrawal(amount) onlyLatestRocketPool returns(bool) {
        // Get an instance of that pool contract
        pool = getPoolInstance(miniPoolAddress);                 
        // Got the users address, now check to see if this is a user withdrawing to their backup address, if so, we need to update the users minipool account
        if (pool.getUserBackupAddressExists(userAddress)) {
            // Get the original deposit address now
            // This will update the users account to match the backup address, but only after many checks and balances
            // It will fail if the user can't use their backup address to withdraw at this point or its not their nominated backup address trying
            assert(userChangeWithdrawalDepositAddressToBackupAddress(pool.getUserAddressFromBackupAddress(userAddress), miniPoolAddress) == true);
            // Set the user address now
            userAddress = msg.sender; 
        }  
        // Get the user deposit now, this will throw if the user doesn't exist in the given pool
        uint256 userBalance = pool.getUserDeposit(userAddress);
        address userPartnerAddress = pool.getUserPartner(userAddress);
        // Now check to see if the given partner matches the users partner
        if (userPartnerAddress != 0 && partnerAddress != 0) {
            // The supplied partner for the user does not match the sender
            assert(userPartnerAddress == partnerAddress);
        }
        // Check to see if the user is actually in this pool and has a deposit
        assert(userBalance > 0);
        // Check the status, must be accepting deposits, counting down to staking launch to allow withdrawals before staking incase users change their mind or officially awaiting withdrawals after staking
        assert(pool.getStatus() == 0 || pool.getStatus() == 1 || pool.getStatus() == 4);
        // The pool has now received its deposit +rewards || -penalties from the Casper contract and users can withdraw
        // Users withdraw all their deposit + rewards at once when the pool has finished staking
        // We need to update the users balance, rewards earned and fees incurred totals, then allow withdrawals
        if (pool.getStatus() == 4) {
            // Update the users new balance, rewards earned and fees incurred
            if (userUpdateDepositAndRewards(miniPoolAddress, userAddress)) {
                // Get their updated balance now as they are withdrawing it all
                amount = pool.getUserDeposit(userAddress);
            }
        }
        // 0 amount or less given withdraws the entire users deposit
        amount = amount <= 0 ? userBalance : amount;
        // Ok send the deposit to the user from the mini pool now
        assert(pool.withdraw(userAddress, amount) == true);
        // Successful withdrawal
        Transferred(miniPoolAddress, userAddress, keccak256("withdrawal"), amount, now);    
        // Success
        return true; 
    }

    /// @dev Our mini pool has requested to update its users deposit amount and rewards after staking has been completed, all main checks are done here as this contract is upgradable, but mini pools currently deployed are not 
    /// @param userAddress The address of the mini pool user.
    /// @param miniPoolAddress The address of the mini pool they wish to withdraw from.
    function userUpdateDepositAndRewards(address miniPoolAddress, address userAddress) private returns (bool) {
        // Get our rocket settings 
        rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        // Get an instance of that pool contract
        pool = getPoolInstance(miniPoolAddress);
        // Get the current user balance
        uint256 userBalance = pool.getUserDeposit(userAddress);
        // The total the user will be able to withdraw +/- rewards and also minus our fee if applicable
        uint256 userBalanceUpdated = 0;
        // We also store the users calculated rewards so we can see how much the original balance has changed (can be negative if penalties occured)
        int256 userRewardsAmount = 0;
        // If the user has earned rewards by staking, we take our fee from that amount (not the entire deposit)
        uint256 userFeesAmount = 0;
        // Calculate the % of the stake the user had from their original deposit
        uint256 userDepositPercInWei = Arithmetic.overflowResistantFraction(userBalance, calcBase, pool.getStakingBalance());
        // Calculate how much the user deposit has changed based on their original % deposited and the new post Casper balance of the pool
        uint256 userDepositAmountUpdated = Arithmetic.overflowResistantFraction(userDepositPercInWei, pool.getStakingBalanceReceived(), calcBase);
        // Calculate how much rewards the user earned
        userRewardsAmount = int256(userDepositAmountUpdated - userBalance);
        // So only process fees if we've received rewards from Casper
        if (userRewardsAmount > 0) {
            // Calculate the fee we take from the rewards now to cover node server costs etc
            userFeesAmount = Arithmetic.overflowResistantFraction(rocketSettings.getWithdrawalFeePercInWei(), uint256(userRewardsAmount), calcBase);
            // The total the user will receive '(deposit + rewards) - fees'
            userBalanceUpdated = (userDepositAmountUpdated - userFeesAmount);
        } else {
            // Either no rewards have been given, or we've incurred penalites from Casper for some reason (node server failure etc), no fee charged in that case as we've dropped the ball for some reason   
            userBalanceUpdated = userDepositAmountUpdated;
        }
        
        // Update our users updated balance, rewards calculated and fees incurred 
        if (pool.setUserBalanceRewardsFees(userAddress, userBalanceUpdated, userRewardsAmount, userFeesAmount)) {
            return true;
        }
        return false;
    }

    /// @notice Change the users backup withdrawal address
    /// @dev A user can specify a backup withdrawal address (incase something bad happens :( or they lose their primary private keys while staking etc)
    /// @param miniPoolAddress The address of the mini pool they the supplied user account is in.
    /// @param newUserAddressUsedForDeposit The address the user wishes to make their backup withdrawal address
    function userSetWithdrawalDepositAddress(address newUserAddressUsedForDeposit, address miniPoolAddress) public returns(bool) {
        // Get an instance of that pool contract
        pool = getPoolInstance(miniPoolAddress);
        // User can only set this backup address before deployment to casper, also partners cannot set this address to their own to prevent them accessing the users funds after the set withdrawal backup period expires
        if ((pool.getStatus() == 0 || pool.getStatus() == 1) && newUserAddressUsedForDeposit != 0 && pool.getUserPartner(msg.sender) != newUserAddressUsedForDeposit) {
            if (pool.setUserAddressBackupWithdrawal(msg.sender, newUserAddressUsedForDeposit)) {
                // Fire the event
                UserSetBackupWithdrawalAddress(msg.sender, newUserAddressUsedForDeposit, miniPoolAddress, now);
            }
        }
        return false;
    }

    /// @notice Change a users withdrawal address to their supplied backup address - can only be done after withdrawal by the primary address has not been done after a set period
    /// @dev A user who has supplied a backup address to allow withdrawals from (incase something bad happens :( or they lose their primary private keys while staking etc)
    /// @param miniPoolAddress The address of the mini pool they wish to withdraw from.
    /// @param userAddressUsedForDeposit The address used for the initial deposit that they wish to withdraw from on behalf of
    function userChangeWithdrawalDepositAddressToBackupAddress(address userAddressUsedForDeposit, address miniPoolAddress) private returns(bool) {
        // Get the hub
        rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        // Get an instance of that pool contract
        pool = getPoolInstance(miniPoolAddress);
        // Check to make sure this feature is currently enabled
        if (rocketSettings.getPoolUserBackupCollectEnabled()) {
            // This can only occur after a pool has received its Casper deposit (some time ago) and the pool is allowing withdrawals and the given address must match the accounts they wish to withdraw from
            if (now >= (pool.getStatusChangeTime() + rocketSettings.getPoolUserBackupCollectTime()) && pool.getStatus() == 4) {
                // Ok we've gotten this far, original deposit address definitely has this address  as a backup?
                if (pool.getUserBackupAddressOK(userAddressUsedForDeposit, msg.sender)) {
                    // Ok we're all good, lets change the initial user deposit address to the backup one so they can call the normal withdrawal process
                    if (pool.setUserAddressToCurrentBackupWithdrawal(userAddressUsedForDeposit, msg.sender)) {
                        // Fire the event
                        UserChangedToWithdrawalAddress(userAddressUsedForDeposit, msg.sender, miniPoolAddress, now);
                        // Cool
                        return true;
                    }
                }
            }
        }
        return false;
    }


    /// @notice Withdraw Rocket Deposit Tokens from your deposit?
    /// @dev Will mint new tokens for this user that backs their deposit and can be traded on the open market - not available for partner accounts atm
    /// @param _miniPoolAddress The address of the mini pool they wish to withdraw tokens from.
    /// @param _amount The amount in Wei to withdraw, passing 0 will withdraw the users whole balance.
    function userWithdrawDepositTokens(address _miniPoolAddress, uint256 _amount) public returns(bool) {
        // Rocket settings
        rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        // Get an instance of that pool contract
        pool = getPoolInstance(_miniPoolAddress);         
        // Get Rocket Deposit Token
        RocketDepositToken rocketDepositToken = RocketDepositToken(rocketStorage.getAddress(keccak256("contract.name", "rocketDepositToken"))); 
        // Get the user deposit now, this will throw if the user doesn't exist in the given pool
        uint256 userBalance = pool.getUserDeposit(msg.sender);
        // 0 amount or less given withdraws the entire users deposit
        _amount = _amount <= 0 ? userBalance : _amount;
        // Check to see if the user is actually in this pool and has a deposit, and is not a partner user
        assert(_amount > 0 && pool.getUserPartner(msg.sender) == 0); 
        // Check the status, must be currently staking to allow tokens to be withdrawn
        assert(pool.getStatus() == 2);
        // Take the fee out of the tokens to be sent, need to do it this way incase they are withdrawing their entire balance as tokens
        uint256 userDepositTokenFeePercInWei = Arithmetic.overflowResistantFraction(rocketSettings.getDepositTokenWithdrawalFeePercInWei(), _amount, calcBase);
        // Take the token withdrawal fee from the ether amount so we can make tokens which match that amount
        uint256 tokenAmount = (_amount-userDepositTokenFeePercInWei);
        // Ok lets mint those tokens now - minus the fee amount
        if (rocketDepositToken.mint(msg.sender, tokenAmount)) {
            // Cool, lets update the users deposit total and flag that the user has outstanding tokens
            if (pool.setUserDepositTokensOwedAdd(msg.sender, _amount, tokenAmount)) {
                // Fire the event
                DepositTokensWithdrawal(msg.sender, _amount, tokenAmount, now);
                // All good
                return true;
            }
        }
    }

 

}
