pragma solidity 0.4.18;


import "./contract/Ownable.sol";
import "./RocketPoolMini.sol"; 
import "./RocketDepositToken.sol"; 
import "./interface/RocketStorageInterface.sol";
import "./interface/RocketSettingsInterface.sol";
import "./interface/RocketPoolInterface.sol";


/// @title Rocket Pool Users
/// @author David Rugendyke
contract RocketUser is Ownable {

    /**** Properties ************/

    uint256 public version = 1;                             // Version of this contract
    bool private depositsAllowed = true;                    // Are user deposits currently allowed?
    uint256 private minDepositWei = 1 ether;                // Min required deposit
    uint256 private maxDepositWei = 75 ether;               // Max required deposit
    bool private withdrawalsAllowed = true;                 // Are withdrawals allowed?
    uint256 private minWithdrawalWei = 0;                   // Min allowed to be withdrawn, 0 = all
    uint256 private maxWithdrawalWei = 10 ether;            // Max allowed to be withdrawn
    uint256 private calcBase = 1 ether;                     // Use this as our base unit to remove the decimal place by multiplying and dividing by it since solidity doesn't support reals yet


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

    event UserDepositTokensWithdrawal (
        address indexed _userAddress,
        uint256 amount,
        uint256 tokenAmount,
        uint256 created
    );

    event Transferred (
        address indexed _from,
        address indexed _to, 
        bytes32 indexed _typeOf, 
        uint256 value,
        uint256 created
    );


    event FlagUint (
        uint256 flag
    );

    event FlagAddress (
        address flag
    );

    /*** Modifiers *************/

    /// @dev Only allow access from the latest version of the RocketPool contract
    modifier onlyLatestRocketPool() {
        require(this == rocketStorage.getAddress(keccak256("contract.name", "rocketPool")));
        _;
    }

    /// @dev Only allow access from the latest version of the main RocketPartnerAPI contract
    modifier onlyLatestRocketPartnerAPI() {
        require(msg.sender == rocketStorage.getAddress(keccak256("contract.name", "rocketPartnerAPI")));
        _;
    } 

    /// @dev User deposits must be validated
    modifier acceptableDeposit {
        require(depositsAllowed && msg.value >= minDepositWei && msg.value <= maxDepositWei); 
        _;
    }

    /// @dev User withdrawals must be validated
    /// @param amount The amount to withdraw
    modifier acceptableWithdrawal(uint256 amount) {
        require(withdrawalsAllowed && amount >= minWithdrawalWei && amount <= maxWithdrawalWei);
        _;
    }

    /*** Constructor *************/
   
    /// @dev rocketUser constructor
    function RocketUser(address _rocketStorageAddress) public { 
        // Update the contract address 
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
    }

    /*** Setters *************/

    // @dev Are deposits allowed for this version of Rocket Pool?
    /// @param areDepositsAllowed True or False
    function setUserDepositsAllowed(bool areDepositsAllowed) public onlyOwner {
        depositsAllowed = areDepositsAllowed;
    }

    // @dev Set the min amount of Ether required for a deposit in Wei
    /// @param amountInWei The amount in Wei
    function setUserMinDepositAllowed(uint256 amountInWei) public onlyOwner {
        minDepositWei = amountInWei;
    }

    // @dev Set the max amount of Ether required for a deposit in Wei
    /// @param amountInWei The amount in Wei
    function setUserMaxDepositAllowed(uint256 amountInWei) public onlyOwner {
        maxDepositWei = amountInWei;
    }

    // @dev Are withdrawals allowed for this version of Rocket Pool?
    /// @param areWithdrawalsAllowed True or False
    function setUserWithdrawalsAllowed(bool areWithdrawalsAllowed) public onlyOwner {
        withdrawalsAllowed = areWithdrawalsAllowed;
    }

    // @dev Set the min amount of Ether required for a withdrawals in Wei
    /// @param amountInWei The amount in Wei
    function setUserMinDepositsAllowed(uint256 amountInWei) public onlyOwner {
        minWithdrawalWei = amountInWei;
    }

    // @dev Set the max amount of Ether required for a withdrawals in Wei
    /// @param amountInWei The amount in Wei
    function setUserMaxWithdrawalAllowed(uint256 amountInWei) public onlyOwner {
        maxWithdrawalWei = amountInWei;
    }
    
    /*** Methods *************/

    /// @notice Send `msg.value ether` Eth from the account of `message.caller.address()`, to an account accessible only by Rocket Pool at `to.address()`.
    /// @dev Fallback function, user direct deposit to Rocket Pool 
    function userDeposit(string _poolStakingTimeID) public payable {   
        // Direct deposit to Rocket Pool, set partner address to 0 to indicate no partner but an awesome direct Rocket Pool user
        deposit(msg.sender, 0, _poolStakingTimeID);
    }

    /// @dev Deposit to Rocket Pool from the 3rd party partner API on behalf of their managed user
    function userDepositFromPartner(address _partnerUserAddress, address _partnerAddress, string _poolStakingTimeID) public payable onlyLatestRocketPartnerAPI returns(bool) { 
        // Make the deposit on behalf of the 3rd party partners user
        if (deposit(_partnerUserAddress, _partnerAddress, _poolStakingTimeID)) {
            return true;
        }
        return false;       
    }

    /// @notice Send `msg.value ether` Eth from the account of `message.caller.address()`, to an account accessible only by Rocket Pool at `to.address()`.
    /// @dev Deposit to Rocket Pool, can be from a user or a partner on behalf of their user
    /// @param _userAddress The address of the user whom the deposit belongs too
    /// @param _partnerAddress The address of the registered 3rd party partner whom is in control of the supplid user account that the deposit belongs too
    /// @param _poolStakingTimeID The ID that determines which pool the user intends to join based on the staking time of that pool (3 months, 6 months etc)
    function deposit(address _userAddress, address _partnerAddress, string _poolStakingTimeID) acceptableDeposit private returns(bool) { 
        // Check to verify the supplied mini pool staking time id is legit
        rocketPool = RocketPoolInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketPool")));
        // Check to verify the supplied mini pool staking time id is legit
        rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        // Legit time staking ID? 
        require(rocketSettings.getPoolStakingTimeExists(_poolStakingTimeID) == true);
        // Set it now
        uint256 poolStakingDuration = rocketSettings.getPoolStakingTime(_poolStakingTimeID);
        // Assign the user to a matching staking time pool if they don't already belong to one awaiting deposits
        // If no pools are currently available, a new pool for the user will be created
        address poolUserBelongsToo = rocketPool.addUserToAvailablePool(_userAddress, _partnerAddress, poolStakingDuration);
        // We have a pool for the user, get the pool to withdraw the users deposit to its own contract account
        RocketPoolMini poolDepositTo = RocketPoolMini(poolUserBelongsToo);
        // Get the pool to withdraw the users deposit to its contract balance
        require(poolDepositTo.deposit.value(msg.value).gas(100000)(_userAddress) == true);
        // Update the pools status now
        poolDepositTo.updateStatus();
        // All good? Fire the event for the new deposit
        Transferred(_userAddress, poolUserBelongsToo, keccak256("deposit"), msg.value, now);   
        // Done
        return true;
    }
    
    /// @notice Withdraw ether from Rocket Pool
    /// @dev A regular Rocket Pool user withdrawing their deposit
    /// @param _miniPoolAddress The address of the mini pool they wish to withdraw from.
    /// @param _amount The amount in Wei to withdraw, passing 0 will withdraw the users whole balance.
    function userWithdraw(address _miniPoolAddress, uint256 _amount) external returns(bool) {
        // Call our transfer method, creates a transaction
        return userWithdrawDepositFromPoolTransfer(msg.sender, _miniPoolAddress, _amount, 0);
    }

    /// @notice Withdraw ether from Rocket Pool via a 3rd party partner
    /// @dev A Rocket Pool 3rd party partner withdrawing their users deposit
    /// @param _miniPoolAddress The address of the mini pool they wish to withdraw from.
    /// @param _amount The amount in Wei to withdraw, passing 0 will withdraw the users whole balance.
    /// @param _partnerAddress The address of the registered 3rd party partner whom is in control of the supplid user account that the deposit belongs too
    /// @param _partnerUserAddress The address of the registered 3rd party partners user
    function userWithdrawFromPartner(address _miniPoolAddress, uint256 _amount, address _partnerAddress, address _partnerUserAddress) public onlyLatestRocketPartnerAPI returns(bool) {
        // Call our transfer method, creates a transaction
        return userWithdrawDepositFromPoolTransfer(_partnerUserAddress, _miniPoolAddress, _amount, _partnerAddress);
    }

    /// @dev User has requested withdrawing their deposit from a pool, all main checks are done here as this contract is upgradable, but mini pools are not.
    /// @param _userAddress The address to use for withdrawals, can also be a partners users address withdrawing on behalf of their user
    /// @param _miniPoolAddress The address of the mini pool they wish to withdraw from.
    /// @param _amount The amount in Wei to withdraw, passing 0 will withdraw the users whole balance.
    /// @param _partnerAddress The address of the partner 
    function userWithdrawDepositFromPoolTransfer(address _userAddress, address _miniPoolAddress, uint256 _amount, address _partnerAddress) private acceptableWithdrawal(_amount) returns(bool) {
        // Get an instance of that pool contract
        rocketPoolMini = RocketPoolMini(_miniPoolAddress);       
        // Got the users address, now check to see if this is a user withdrawing to their backup address, if so, we need to update the users minipool account
        if (rocketPoolMini.getUserBackupAddressExists(_userAddress)) {
            // Get the original deposit address now
            // This will update the users account to match the backup address, but only after many checks and balances
            // It will fail if the user can't use their backup address to withdraw at this point or its not their nominated backup address trying
            require(userChangeWithdrawalDepositAddressToBackupAddress(rocketPoolMini.getUserAddressFromBackupAddress(_userAddress), _miniPoolAddress) == true);
            // Set the user address now
            _userAddress = msg.sender; 
        }  
        // Get the user deposit now, this will throw if the user doesn't exist in the given pool
        uint256 userBalance = rocketPoolMini.getUserDeposit(_userAddress);
        address userPartnerAddress = rocketPoolMini.getUserPartner(_userAddress);
        // Now check to see if the given partner matches the users partner
        if (userPartnerAddress != 0 && _partnerAddress != 0) {
            // The supplied partner for the user does not match the sender
            require(userPartnerAddress == _partnerAddress);
        }

        // Check to see if the user is actually in this pool and has a deposit
        require(userBalance > 0);
        // Check the status, must be accepting deposits, counting down to staking launch to allow withdrawals before staking incase users change their mind or officially awaiting withdrawals after staking
        require(rocketPoolMini.getStatus() == 0 || rocketPoolMini.getStatus() == 1 || rocketPoolMini.getStatus() == 4);
        // The pool has now received its deposit +rewards || -penalties from the Casper contract and users can withdraw
        // Users withdraw all their deposit + rewards at once when the pool has finished staking
        // We need to update the users balance, rewards earned and fees incurred totals, then allow withdrawals
        if (rocketPoolMini.getStatus() == 4) {
            // Update the users new balance, rewards earned and fees incurred
            if (userUpdateDepositAndRewards(_miniPoolAddress, _userAddress)) {
                // Get their updated balance now as they are withdrawing it all
                _amount = rocketPoolMini.getUserDeposit(_userAddress);
            }
        }
        // 0 amount or less given withdraws the entire users deposit
        _amount = _amount <= 0 ? userBalance : _amount;
        // Ok send the deposit to the user from the mini pool now
        require(rocketPoolMini.withdraw(_userAddress, _amount) == true);
        // Successful withdrawal
        Transferred(_miniPoolAddress, _userAddress, keccak256("withdrawal"), _amount, now);    
        // Success
        return true; 
    }

    /// @dev Our mini pool has requested to update its users deposit amount and rewards after staking has been completed, all main checks are done here as this contract is upgradable, but mini pools currently deployed are not 
    /// @param _userAddress The address of the mini pool user.
    /// @param _miniPoolAddress The address of the mini pool they wish to withdraw from.
    function userUpdateDepositAndRewards(address _miniPoolAddress, address _userAddress) private returns (bool) {
        // Get our rocket settings 
        rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        // Get an instance of that pool contract
        rocketPoolMini = RocketPoolMini(_miniPoolAddress);       
        // Get the current user balance
        uint256 userBalance = rocketPoolMini.getUserDeposit(_userAddress);
        // The total the user will be able to withdraw +/- rewards and also minus our fee if applicable
        uint256 userBalanceUpdated = 0;
        // We also store the users calculated rewards so we can see how much the original balance has changed (can be negative if penalties occured)
        int256 userRewardsAmount = 0;
        // If the user has earned rewards by staking, we take our fee from that amount (not the entire deposit)
        uint256 userFeesAmount = 0;
        // Calculate the % of the stake the user had from their original deposit
        uint256 userDepositPercInWei = Arithmetic.overflowResistantFraction(userBalance, calcBase, rocketPoolMini.getStakingBalance());
        // Calculate how much the user deposit has changed based on their original % deposited and the new post Casper balance of the pool
        uint256 userDepositAmountUpdated = Arithmetic.overflowResistantFraction(userDepositPercInWei, rocketPoolMini.getStakingBalanceReceived(), calcBase);
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
        if (rocketPoolMini.setUserBalanceRewardsFees(_userAddress, userBalanceUpdated, userRewardsAmount, userFeesAmount)) {
            return true;
        }
        return false;
    }

    /// @notice Change the users backup withdrawal address
    /// @dev A user can specify a backup withdrawal address (incase something bad happens :( or they lose their primary private keys while staking etc)
    /// @param _miniPoolAddress The address of the mini pool they the supplied user account is in.
    /// @param _newUserAddressUsedForDeposit The address the user wishes to make their backup withdrawal address
    function userSetWithdrawalDepositAddress(address _newUserAddressUsedForDeposit, address _miniPoolAddress) public returns(bool) {
        // Get an instance of that pool contract
        rocketPoolMini = RocketPoolMini(_miniPoolAddress);       
        // User can only set this backup address before deployment to casper, also partners cannot set this address to their own to prevent them accessing the users funds after the set withdrawal backup period expires
        if ((rocketPoolMini.getStatus() == 0 || rocketPoolMini.getStatus() == 1) && _newUserAddressUsedForDeposit != 0 && rocketPoolMini.getUserPartner(msg.sender) != _newUserAddressUsedForDeposit) {
            if (rocketPoolMini.setUserAddressBackupWithdrawal(msg.sender, _newUserAddressUsedForDeposit)) {
                // Fire the event
                UserSetBackupWithdrawalAddress(msg.sender, _newUserAddressUsedForDeposit, _miniPoolAddress, now);
                // All good
                return true; 
            }
        }
        return false;
    }

    /// @notice Change a users withdrawal address to their supplied backup address - can only be done after withdrawal by the primary address has not been done after a set period
    /// @dev A user who has supplied a backup address to allow withdrawals from (incase something bad happens :( or they lose their primary private keys while staking etc)
    /// @param _miniPoolAddress The address of the mini pool they wish to withdraw from.
    /// @param _userAddressUsedForDeposit The address used for the initial deposit that they wish to withdraw from on behalf of
    function userChangeWithdrawalDepositAddressToBackupAddress(address _userAddressUsedForDeposit, address _miniPoolAddress) private returns(bool) {
        // Get the hub
        rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        // Get an instance of that pool contract
        rocketPoolMini = RocketPoolMini(_miniPoolAddress);       
        // Check to make sure this feature is currently enabled
        if (rocketSettings.getPoolUserBackupCollectEnabled()) {
            // This can only occur after a pool has received its Casper deposit (some time ago) and the pool is allowing withdrawals and the given address must match the accounts they wish to withdraw from
            if (now >= (rocketPoolMini.getStatusChangeTime() + rocketSettings.getPoolUserBackupCollectTime()) && rocketPoolMini.getStatus() == 4) {
                // Ok we've gotten this far, original deposit address definitely has this address  as a backup?
                if (rocketPoolMini.getUserBackupAddressOK(_userAddressUsedForDeposit, msg.sender)) {
                    // Ok we're all good, lets change the initial user deposit address to the backup one so they can call the normal withdrawal process
                    if (rocketPoolMini.setUserAddressToCurrentBackupWithdrawal(_userAddressUsedForDeposit, msg.sender)) {
                        // Fire the event
                        UserChangedToWithdrawalAddress(_userAddressUsedForDeposit, msg.sender, _miniPoolAddress, now);
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
    // TODO: Allow partners to withdraw deposit tokens for their users
    function userWithdrawDepositTokens(address _miniPoolAddress, uint256 _amount) public returns(bool) {
        // Rocket settings
        rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        // Get an instance of that pool contract
        rocketPoolMini = RocketPoolMini(_miniPoolAddress);             
        // Get Rocket Deposit Token
        RocketDepositToken rocketDepositToken = RocketDepositToken(rocketStorage.getAddress(keccak256("contract.name", "rocketDepositToken"))); 
        // Get the user deposit now, this will throw if the user doesn't exist in the given pool
        uint256 userBalance = rocketPoolMini.getUserDeposit(msg.sender);
        // 0 amount or less given withdraws the entire users deposit
        _amount = _amount <= 0 ? userBalance : _amount;
        // Check to see if the user is actually in this pool and has a deposit, and is not a partner user
        require(_amount > 0 && rocketPoolMini.getUserPartner(msg.sender) == 0);        
        // Check the status, must be currently staking to allow tokens to be withdrawn
        require(rocketPoolMini.getStatus() == 2);
        // Take the fee out of the tokens to be sent, need to do it this way incase they are withdrawing their entire balance as tokens
        uint256 userDepositTokenFeePercInWei = Arithmetic.overflowResistantFraction(rocketSettings.getDepositTokenWithdrawalFeePercInWei(), _amount, calcBase);
        // Take the token withdrawal fee from the ether amount so we can make tokens which match that amount
        uint256 tokenAmount = (_amount-userDepositTokenFeePercInWei);
        // Ok lets mint those tokens now - minus the fee amount
        if (rocketDepositToken.mint(msg.sender, tokenAmount)) {
            // Cool, lets update the users deposit total and flag that the user has outstanding tokens
            if (rocketPoolMini.setUserDepositTokensOwedAdd(msg.sender, _amount, tokenAmount)) {
                // Fire the event
                UserDepositTokensWithdrawal(msg.sender, _amount, tokenAmount, now);
                // All good
                return true;
            }
        }
    }
}
