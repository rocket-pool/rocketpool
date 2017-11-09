pragma solidity 0.4.18;

import "./contract/Owned.sol";
import "./RocketHub.sol";
import "./interface/RocketStorageInterface.sol";
import "./interface/RocketPoolInterface.sol";


/// @title RocketPartnerAPI - Used by Rocket Pool partners to access the Rocket Pool network
/// @author David Rugendyke

contract RocketPartnerAPI is Owned {


    /**** RocketNode ************/

    address public rocketHubAddress;                // Main hub address
    uint256 public version;                         // Version of this contract


    /*** Contracts **************/

    RocketHub rocketHub = RocketHub(0);                 // The main RocketHub contract where primary persistant storage is maintained
    RocketStorageInterface rocketStorage = RocketStorageInterface(0);     // The main storage  contract where primary persistant storage is maintained  
  

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

    event FlagUint (
        uint256 flag
    );
    
    event FlagAddress (
        address flag
    );

       

    /*** Modifiers *************/

    /// @dev Only allow access from the latest version of the RocketPool contract
    modifier onlyLatestRocketPool() {
        assert(msg.sender == rocketStorage.getAddress(keccak256("contract.name", "rocketPool")));
        _;
    }

    /// @dev Only registered partner addresses can access
    modifier onlyRegisteredPartner() {
        require(rocketStorage.getBool(keccak256("partner.exists", msg.sender)) == true);  
        _;
    }

    
    /*** Constructor *************/
   
    /// @dev rocketNode constructor
    function RocketPartnerAPI(address _rocketStorageAddress) public {
        // Update the contract address
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
        // Set the current version of this contract
        version = 1;
    }


     /*** Getters *************/

    /// @dev Returns the amount of registered rocket nodes
    function getPartnerCount() public view returns(uint) {
        return rocketStorage.getUint(keccak256("partners.total"));
    }


    /// @dev Get the address to deposit to with Rocket Pool
    function getAPIdepositAddress() public view returns(address) { 
        // The partner address being supplied must also match the sender address
        return rocketHub.getAddress(keccak256("rocketPool"));
    }

    
    /*** Setters *************/
   
    /// @notice Send `msg.value ether` Eth from the account of `message.caller.address()`, to an account accessible only by Rocket Pool at `to.address()` with partner address `partnerAddress`.
    /// @dev Deposit to Rocket Pool via a partner on behalf of their user
    /// @param _partnerUserAddress The address of the user whom the deposit belongs too and the 3rd party is in control of
    /// @param _poolStakingTimeID The ID that determines which pool the user intends to join based on the staking time of that pool (3 months, 6 months etc)
    function setAPIpartnerDeposit(address _partnerUserAddress, string _poolStakingTimeID) public payable onlyRegisteredPartner { 
        // If the user is not a direct Rocket Pool user but a partner user, check the partner is legit
        // The partner address being supplied must also match the sender address
        RocketPoolInterface rocketPool = RocketPoolInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketPool")));
        // Make the deposit now and validate it - needs a lot of gas to cover potential minipool creation for this user (if throw errors start appearing, increase/decrease gas to cover the changes in the minipool)
        if (rocketPool.depositPartner.value(msg.value).gas(2400000)(_partnerUserAddress, msg.sender, _poolStakingTimeID)) {
            // Fire the event now
            APIpartnerDepositAccepted(msg.sender, _partnerUserAddress, _poolStakingTimeID, msg.value, now);
        }
    }

    /// @notice Withdraw ether from Rocket Pool via a 3rd party partner
    /// @dev A 3rd party partner Rocket Pool user withdrawing their users deposit
    /// @param _miniPoolAddress The address of the mini pool they wish to withdraw from.
    /// @param _amount The amount in Wei to withdraw, passing 0 will withdraw the users whole balance.
    /// @param _partnerUserAddress The address of the partners user to withdraw from and send the funds too.
    function setAPIpartnerWithdrawal(address _miniPoolAddress, uint256 _amount, address _partnerUserAddress) public onlyRegisteredPartner returns(bool) {
        // Get the main Rocket Pool contract
        RocketPoolInterface rocketPool = RocketPoolInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketPool")));
        // Forward the deposit to our main contract, call our transfer method, creates a transaction 
        if (rocketPool.userPartnerWithdrawDeposit.gas(600000)(_miniPoolAddress, _amount, _partnerUserAddress, msg.sender)) {
            // Fire the event now
            APIpartnerWithdrawalAccepted(msg.sender, _partnerUserAddress, now);
        }
    }



    /*** Owner Only Partner Methods *************/

    /// @dev Register a new partner address if it doesn't exist, only the contract creator can do this
    /// @param _newPartnerAddress The msg.sender address the partner will use
    /// @param _newPartnerName The msg.sender address the partner will use
    function setPartner(address _newPartnerAddress, string _newPartnerName) public onlyOwner {
        // Check the address is ok
        require(_newPartnerAddress != 0x0);
        // Check it doesn't already exist
        require(!rocketStorage.getBool(keccak256("partner.exists", _newPartnerAddress)));  
        // Get how many partners we currently have  
        uint256 partnerCountTotal = rocketStorage.getUint(keccak256("partners.total")); 
        // Ok now set our data to key/value pair storage
        rocketStorage.setString(keccak256("partner.name", _newPartnerAddress), _newPartnerName);
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

    /// @dev Remove a partner from the Rocket Pool network
    /// @param _partnerAddress The address of the partner
    function setPartnerRemove(address _partnerAddress) public onlyOwner {
        // Remove partner from the primary persistent storage
        if (rocketHub.setRocketPartnerRemove(_partnerAddress)) {
            // Fire the event
            PartnerRemoved(_partnerAddress, now);
        }
    } 
    

}
