pragma solidity ^0.4.11;

import "./contract/Owned.sol";
import "./RocketHub.sol";
import "./interface/RocketPoolInterface.sol";


/// @title RocketPartnerAPI - Used by Rocket Pool partners to access the Rocket Pool network
/// @author David Rugendyke

contract RocketPartnerAPI is Owned {


    /**** RocketNode ************/
    address public rocketHubAddress;
    // Version of this contract
    uint256 public version;
  

    /*** Events ****************/

    event APIpartnerDepositAccepted (
        address indexed _partner,
        address indexed _user, 
        bytes32 poolStakingTimeID,
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
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        assert(msg.sender == rocketHub.getRocketPoolAddress());
        _;
    }

    /// @dev Only registered partner addresses can access
    modifier onlyRegisteredPartner() {
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        assert (rocketHub.getRocketPartnerExists(msg.sender) == true);
        _;
    }

    
    /*** Constructor *************/
   
    /// @dev rocketNode constructor
    function RocketPartnerAPI(address deployedRocketHubAddress) {
        // Set the address of the main hub
        rocketHubAddress = deployedRocketHubAddress;
        // Set the current version of this contract
        version = 1;
    }


    /*** Public Partner Methods *************/

    /// @dev Get the address to deposit to with Rocket Pool
    function APIgetDepositAddress() public returns(address) { 
        // The partner address being supplied must also match the sender address
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        return rocketHub.getRocketPoolAddress();
    }
   
    /// @notice Send `msg.value ether` Eth from the account of `message.caller.address()`, to an account accessible only by Rocket Pool at `to.address()` with partner address `partnerAddress`.
    /// @dev Deposit to Rocket Pool via a partner on behalf of their user
    /// @param partnerUserAddress The address of the user whom the deposit belongs too and the 3rd party is in control of
    /// @param poolStakingTimeID The ID (bytes32 encoded string) that determines which pool the user intends to join based on the staking time of that pool (3 months, 6 months etc)
    function APIpartnerDeposit(address partnerUserAddress, bytes32 poolStakingTimeID) public payable onlyRegisteredPartner { 
        // If the user is not a direct Rocket Pool user but a partner user, check the partner is legit
        // The partner address being supplied must also match the sender address
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        RocketPoolInterface rocketPool = RocketPoolInterface(rocketHub.getRocketPoolAddress());
        // Make the deposit now and validate it - needs a lot of gas to cover potential minipool creation for this user (if throw errors start appearing, increase/decrease gas to cover the changes in the minipool)
        if (rocketPool.partnerDeposit.value(msg.value).gas(2300000)(partnerUserAddress, msg.sender, poolStakingTimeID)) {
            // Fire the event now
            APIpartnerDepositAccepted(msg.sender, partnerUserAddress, poolStakingTimeID, msg.value, now);
        }

        /* // Good idea, but best implemented with a shell contract that needs to spawn other contracts of the same type
        if(rocketHub.getRocketPoolAddress().delegatecall(bytes4(sha3("partnerDeposit(address,bytes32)")), partnerUserAddress, poolStakingTimeID)) {
            APIpartnerDepositAccepted(msg.sender, partnerUserAddress, poolStakingTimeID, msg.value, now);
        }*/
    }

    /// @notice Withdraw ether from Rocket Pool via a 3rd party partner
    /// @dev A 3rd party partner Rocket Pool user withdrawing their users deposit
    /// @param miniPoolAddress The address of the mini pool they wish to withdraw from.
    /// @param amount The amount in Wei to withdraw, passing 0 will withdraw the users whole balance.
    /// @param partnerUserAddress The address of the partners user to withdraw from and send the funds too.
    function APIpartnerWithdrawDeposit(address miniPoolAddress, uint256 amount, address partnerUserAddress) public onlyRegisteredPartner returns(bool)  {
        // Get the main Rocket Pool contract
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        RocketPoolInterface rocketPool = RocketPoolInterface(rocketHub.getRocketPoolAddress());
        // Forward the deposit to our main contract, call our transfer method, creates a transaction 
        if (rocketPool.userPartnerWithdrawDeposit.gas(600000)(miniPoolAddress, amount, partnerUserAddress, msg.sender)) {
            // Fire the event now
            APIpartnerWithdrawalAccepted(msg.sender, partnerUserAddress, now);
        }
    }



    /*** Owner Only Partner Methods *************/

    /// @dev Register a new partner address if it doesn't exist, only the contract creator can do this
    /// @param partnerAccountAddressToRegister The msg.sender address the partner will use
    /// @param partnerName The msg.sender address the partner will use
    function partnerRegister(address partnerAccountAddressToRegister, string partnerName) public onlyOwner  {
        // Add the partner to the primary persistent storage so any contract upgrades won't effect the current stored partners
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        // Sets the rocket partner if the address is ok and isn't already set
        if (rocketHub.setRocketPartner(partnerAccountAddressToRegister, sha3(partnerName))) {
            // Fire the event
            PartnerRegistered(partnerAccountAddressToRegister, now);
        }
	}

    /// @dev Remove a partner from the Rocket Pool network
    /// @param partnerAddress The address of the partner
    function partnerRemove(address partnerAddress) public onlyOwner {
         // Remove partner from the primary persistent storage
        RocketHub rocketHub = RocketHub(rocketHubAddress);
        // Sets the rocket partner if the address is ok and isn't already set
        if (rocketHub.setRocketPartnerRemove(partnerAddress)) {
            // Fire the event
            PartnerRemoved(partnerAddress, now);
        }
    } 
    

}
