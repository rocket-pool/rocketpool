pragma solidity 0.4.19;


import "./RocketBase.sol";
import "./interface/RocketUserInterface.sol";
import "./interface/RocketStorageInterface.sol";
import "./interface/RocketSettingsInterface.sol";
import "./interface/RocketPoolInterface.sol";


/// @title RocketPartnerAPI - Used by Rocket Pool partners to access the Rocket Pool network
/// @author David Rugendyke

contract RocketPartnerAPI is RocketBase {



    /*** Contracts **************/

    RocketPoolInterface rocketPool = RocketPoolInterface(0);                // The main pool contract
    RocketUserInterface rocketUser = RocketUserInterface(0);                // The main user interface methods
    RocketSettingsInterface rocketSettings = RocketSettingsInterface(0);    // The main settings contract most global parameters are maintained
  
    /*** Events ****************/

    event APIpartnerDepositAccepted (
        address indexed _partner,
        address indexed _user, 
        string  poolStakingTimeID,
        uint256 value,
        uint256 created
    );

    event APIpartnerWithdrawalAccepted (
        address indexed _partner,
        address indexed _user, 
        uint256 created
    );


    event PartnerRegistered (
        address indexed _partnerSendFromAddress,
        uint256 created
    );

    event PartnerRemoved (
        address indexed _address,
        uint256 created
    );

    event PartnerDepositsEnabled (
        address indexed _address,
        bool _enabled,
        uint256 created
    );

    event PartnerWithdrawalsEnabled (
        address indexed _address,
        bool _enabled,
        uint256 created
    );
      
    /*** Modifiers *************/

    /// @dev Only allow access from the latest version of the RocketPool contract
    modifier onlyLatestRocketPool() {
        require(msg.sender == rocketStorage.getAddress(keccak256("contract.name", "rocketPool")));
        _;
    }

    /// @dev Only registered partner addresses can access
    modifier onlyRegisteredPartner(address _partnerAddress) {
        require(rocketStorage.getBool(keccak256("partner.exists", _partnerAddress)) == true);  
        _;
    }

    /// @dev Is this partner allowed to make user deposits?
    modifier onlyDepositsAllowed(address _partnerAddress) {
        require(rocketStorage.getBool(keccak256("partner.depositsAllowed", _partnerAddress)) == true);  
        _;
    }

    /// @dev Is this partner allowed to withdraw their users deposits?
    modifier onlyWithdrawalsAllowed(address _partnerAddress) {
        require(rocketStorage.getBool(keccak256("partner.withdrawalsAllowed", _partnerAddress)) == true);  
        _;
    }

    /*** Constructor *************/
   
    /// @dev rocketNode constructor
    function RocketPartnerAPI(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }

     /*** Getters *************/

    /// @dev Returns the amount of registered rocket nodes
    function getPartnerCount() public view returns(uint) {
        return rocketStorage.getUint(keccak256("partners.total"));
    }

    /// @dev Returns the array index of the partner
    function getPartnerIndex(address _partnerAddress) public view onlyRegisteredPartner(_partnerAddress) returns(uint) {
        return rocketStorage.getUint(keccak256("partner.index", _partnerAddress));
    }

    /// @dev Get the address to deposit to with Rocket Pool
    function getAPIdepositAddress() public view returns(address) { 
        // The partner address being supplied must also match the sender address
        return this;
    }

    /*** Setters *************/
   
    /// @notice Send `msg.value ether` Eth from the account of `message.caller.address()`, to an account accessible only by Rocket Pool at `to.address()` with partner address `partnerAddress`.
    /// @dev Deposit to Rocket Pool via a partner on behalf of their user
    /// @param _partnerUserAddress The address of the user whom the deposit belongs too and the 3rd party is in control of
    /// @param _poolStakingTimeID The ID that determines which pool the user intends to join based on the staking time of that pool (3 months, 6 months etc)
    function APIpartnerDeposit(address _partnerUserAddress, string _poolStakingTimeID) public payable onlyRegisteredPartner(msg.sender) onlyDepositsAllowed(msg.sender) { 
        // Get our settings first
        rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        // If the user is not a direct Rocket Pool user but a partner user, check the partner is legit
        // The partner address being supplied must also match the sender address
        rocketUser = RocketUserInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketUser")));
        // Make the deposit now and validate it - needs a lot of gas to cover potential minipool creation for this user (if throw errors start appearing, increase/decrease gas to cover the changes in the minipool)
        if (rocketUser.userDepositFromPartner.value(msg.value).gas(rocketSettings.getMiniPoolNewGas())(_partnerUserAddress, msg.sender, _poolStakingTimeID)) {
            // Fire the event now 
            APIpartnerDepositAccepted(msg.sender, _partnerUserAddress, _poolStakingTimeID, msg.value, now);
        } 
    }

    /// @notice Withdraw ether from Rocket Pool via a 3rd party partner
    /// @dev A 3rd party partner Rocket Pool user withdrawing their users deposit
    /// @param _miniPoolAddress The address of the mini pool they wish to withdraw from.
    /// @param _amount The amount in Wei to withdraw, passing 0 will withdraw the users whole balance.
    /// @param _partnerUserAddress The address of the partners user to withdraw from and send the funds too.
    function APIpartnerWithdrawal(address _miniPoolAddress, uint256 _amount, address _partnerUserAddress) public onlyRegisteredPartner(msg.sender) onlyWithdrawalsAllowed(msg.sender) returns(bool) {
        // Get the main Rocket User contract
        rocketUser = RocketUserInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketUser")));
        // Forward the deposit to our main contract, call our transfer method, creates a transaction 
        if (rocketUser.userWithdrawFromPartner.gas(600000)(_miniPoolAddress, _amount, msg.sender, _partnerUserAddress)) {
            // Fire the event now 
            APIpartnerWithdrawalAccepted(msg.sender, _partnerUserAddress, now);
        }
    }

    /*** Owner Only Partner Methods *************/

    /// @dev Disable a partners ability to add users deposits
    /// @param _partnerAddress The address of the partner
    function setPartnerDepositsEnabled(address _partnerAddress, bool _enabled) public onlyRegisteredPartner(_partnerAddress) onlyOwner {
        // Disable
        rocketStorage.setBool(keccak256("partner.depositsAllowed", _partnerAddress), _enabled);
        // Fire the event
        PartnerDepositsEnabled(_partnerAddress, _enabled, now);
    }

    /// @dev Disable a partners ability to withdraw users deposits
    /// @param _partnerAddress The address of the partner
    function setPartnerWithdrawalsEnabled(address _partnerAddress, bool _enabled) public onlyRegisteredPartner(_partnerAddress) onlyOwner {
        // Disable
        rocketStorage.setBool(keccak256("partner.withdrawalsAllowed", _partnerAddress), _enabled);
        // Fire the event
        PartnerWithdrawalsEnabled(_partnerAddress, _enabled, now);
    }

    /// @dev Register a new partner address if it doesn't exist, only the contract creator can do this
    /// @param _newPartnerAddress The msg.sender address the partner will use
    /// @param _newPartnerName The msg.sender address the partner will use
    function partnerAdd(address _newPartnerAddress, string _newPartnerName) public onlyOwner {
        // Check the address is ok
        require(_newPartnerAddress != 0x0);
        // Check it doesn't already exist
        require(!rocketStorage.getBool(keccak256("partner.exists", _newPartnerAddress)));  
        // Get how many partners we currently have  
        uint256 partnerCountTotal = rocketStorage.getUint(keccak256("partners.total")); 
        // Ok now set our data to key/value pair storage
        rocketStorage.setString(keccak256("partner.name", _newPartnerAddress), _newPartnerName);
        rocketStorage.setBool(keccak256("partner.depositsAllowed", _newPartnerAddress), true);
        rocketStorage.setBool(keccak256("partner.withdrawalsAllowed", _newPartnerAddress), true);
        rocketStorage.setBool(keccak256("partner.exists", _newPartnerAddress), true);
        // We store our data in an key/value array, so set its index so we can use an array to find it if needed
        rocketStorage.setUint(keccak256("partner.index", _newPartnerAddress), partnerCountTotal);
        // Update total partners
        rocketStorage.setUint(keccak256("partners.total"), partnerCountTotal + 1);
        // We also index all our partners so we can do a reverse lookup based on its array index
        rocketStorage.setAddress(keccak256("partners.index.reverse", partnerCountTotal), _newPartnerAddress);
        // Fire the event
        PartnerRegistered(_newPartnerAddress, now);
    } 

    /// @dev Remove a partner from the Rocket Pool network, note that a partner should first have its user deposits disabled so that their users can withdraw
    /// @param _partnerAddress The address of the partner
    function partnerRemove(address _partnerAddress) public onlyRegisteredPartner(_partnerAddress) onlyOwner {
        // Get total partners
        uint256 partnersTotal = rocketStorage.getUint(keccak256("partners.total"));
        // Now remove this partner data from storage
        uint256 partnerIndex = rocketStorage.getUint(keccak256("partner.index", _partnerAddress));
        rocketStorage.deleteString(keccak256("partner.name", _partnerAddress));
        rocketStorage.deleteBool(keccak256("partner.depositsAllowed", _partnerAddress));
        rocketStorage.deleteBool(keccak256("partner.withdrawalsAllowed", _partnerAddress));
        rocketStorage.deleteBool(keccak256("partner.exists", _partnerAddress));
        rocketStorage.deleteUint(keccak256("partner.index", _partnerAddress));
        // Delete reverse lookup
        rocketStorage.deleteAddress(keccak256("partners.index.reverse", partnerIndex));
        // Update total
        rocketStorage.setUint(keccak256("partners.total"), partnersTotal - 1);
        // Now reindex the remaining nodes
        partnersTotal = rocketStorage.getUint(keccak256("partners.total"));
        // Loop and reindex
        for (uint i = partnerIndex+1; i <= partnersTotal; i++) {
            address partnerAddress = rocketStorage.getAddress(keccak256("partners.index.reverse", i));
            uint256 newIndex = i - 1;
            rocketStorage.setUint(keccak256("partner.index", partnerAddress), newIndex);
            rocketStorage.setAddress(keccak256("partners.index.reverse", newIndex), partnerAddress);
        }
        // Fire the event
        PartnerRemoved(_partnerAddress, now);
    } 
}
