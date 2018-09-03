pragma solidity 0.4.24;

// Contracts
import "../../RocketBase.sol";
import "../../contract/group/RocketGroupContract.sol";
// Interfaces
import "../../interface/settings/RocketGroupSettingsInterface.sol";
// Utilities
import "../../lib/Strings.sol";



/// @title A group is an entity that has users in the Rocket Pool infrastructure
/// @author David Rugendyke

contract RocketGroupAPI is RocketBase {

    /*** Libs  **************/

    using Strings for string;


    /*** Contracts *************/

    RocketGroupSettingsInterface rocketGroupSettings = RocketGroupSettingsInterface(0);           // Settings for the groups
   


    /*** Events ****************/

    event GroupAdd (
        address indexed ID,
        string name,
        uint256 stakingFee,
        uint256 created
    );

    event GroupAddFeeTransfer (
        address ID,
        string name,
        uint256 amount,
        address sentAddress,
        uint256 created
    );


    // TODO: Remove Flag Events
    event FlagString (
        string flag
    );

    event FlagUint (
        uint256 flag
    );

       
    /*** Modifiers *************/
    
       
    /*** Constructor *************/

    /// @dev rocketGroup constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }


    /*** Getters *************/

    /// @dev Get the group by its ID
    function getGroupName(address _ID) public view returns(string) { 
        // Get the group name
        rocketStorage.getString(keccak256(abi.encodePacked("group.name", _ID)));
    }

    /// @dev Get a verified address for the group that's allowed to interact with RP
    function getGroupDepositAddress(address _ID) public view returns(address) { 
        // Get the group name
        rocketStorage.getAddress(keccak256(abi.encodePacked("group.deposit.address", _ID)));
    }
    

    /*** Methods *************/

    /// @dev Register a new group address if it doesn't exist, only the contract creator can do this
    /// @param _name Name of the group (eg rocketpool, coinbase etc) - should be strictly lower case
    /// @param _stakingFee The fee this groups charges their users given as a % of 1 Ether (eg 0.02 ether = 2%)
    function add(string _name, uint256 _stakingFee) public payable onlyLatestContract("rocketGroupAPI", address(this)) returns (bool) {
        // Get the group settings
        rocketGroupSettings = RocketGroupSettingsInterface(getContractAddress("rocketGroupSettings"));
        // Check groups are currently allowed
        require(rocketGroupSettings.getNewAllowed() == true, "Group registrations are currently disabled in Rocket Pool");
         // Make the name lower case
        _name = _name.lower();
        // Check the name is ok
        require(bytes(_name).length > 2, "Group Name is to short, must be a minimum of 3 characters.");
        // Check the group name isn't already being used
        require(bytes(rocketStorage.getString(keccak256(abi.encodePacked("group.name", _name)))).length == 0, "Group name is already being used.");
        // Ok create the groups contract now, the address is their main ID and this is where the groups fees and more will reside
        RocketGroupContract newContractAddress = new RocketGroupContract(address(rocketStorage), msg.sender);
        // Set their fee on the contract now
        newContractAddress.setFeePerc(_stakingFee);
        // If there is a fee required to register a group, check that it is sufficient
        if(rocketGroupSettings.getNewFee() > 0) {
            // Fee correct?
            require(rocketGroupSettings.getNewFee() == msg.value, "New group fee insufficient.");
            // Transfer the fee amount now 
            rocketGroupSettings.getNewFeeAddress().transfer(msg.value);
            // Log it
            emit GroupAddFeeTransfer(newContractAddress, _name, msg.value, rocketGroupSettings.getNewFeeAddress(), now);
        }
        // Add the group to storage now
        uint256 groupCountTotal = rocketStorage.getUint(keccak256(abi.encodePacked("groups.total"))); 
        // Ok now set our data to key/value pair storage
        rocketStorage.setAddress(keccak256(abi.encodePacked("group.id", newContractAddress)), newContractAddress);
        rocketStorage.setString(keccak256(abi.encodePacked("group.name", newContractAddress)), _name);
        rocketStorage.setUint(keccak256(abi.encodePacked("group.fee", newContractAddress)), rocketGroupSettings.getDefaultFee());
        // Add msg.sender as a depositer for this group initially
        rocketStorage.setAddress(keccak256(abi.encodePacked("group.deposit.address", msg.sender)), msg.sender);
        // We store our data in an key/value array, so set its index so we can use an array to find it if needed
        rocketStorage.setUint(keccak256(abi.encodePacked("group.index", newContractAddress)), groupCountTotal);
        // Update total partners
        rocketStorage.setUint(keccak256(abi.encodePacked("groups.total")), groupCountTotal + 1);
        // We also index all our groups so we can do a reverse lookup based on its array index
        rocketStorage.setAddress(keccak256(abi.encodePacked("groups.index.reverse", groupCountTotal)), newContractAddress);
        // Set the name as being used now
        rocketStorage.setString(keccak256(abi.encodePacked("group.name", _name)), _name);
        // Log it
        emit GroupAdd(newContractAddress, _name, _stakingFee, now);
        // Done
        return true;
    }

}