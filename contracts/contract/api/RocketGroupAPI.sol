pragma solidity 0.5.0;

// Contracts
import "../../RocketBase.sol";
import "../../contract/group/RocketGroupContract.sol";
import "../../contract/group/RocketGroupAccessorFactory.sol";
// Interfaces
import "../../interface/settings/RocketGroupSettingsInterface.sol";
import "../../interface/utils/lists/AddressSetStorageInterface.sol";
// Utilities
import "../../lib/Strings.sol";



/// @title A group is an entity that has users in the Rocket Pool infrastructure
/// @author David Rugendyke

contract RocketGroupAPI is RocketBase {

    /*** Libs  **************/

    using Strings for string;


    /*** Contracts *************/

    RocketGroupAccessorFactory rocketGroupAccessorFactory = RocketGroupAccessorFactory(0);        // The default Rocket Group Accessor factory
    RocketGroupSettingsInterface rocketGroupSettings = RocketGroupSettingsInterface(0);           // Settings for the groups
    AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(0);                 // Address list utility
   


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

    event GroupCreateDefaultAccessor (
        address indexed ID,
        address accessorAddress,
        uint256 created
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
    function getGroupName(address _ID) public view returns (string memory) { 
        // Get the group name
        return rocketStorage.getString(keccak256(abi.encodePacked("group.name", _ID)));
    }
    

    /*** Methods *************/

    /// @dev Register a new group address if it doesn't exist, only the contract creator can do this
    /// @param _name Name of the group (eg rocketpool, coinbase etc) - should be strictly lower case
    /// @param _stakingFee The fee this groups charges their users given as a % of 1 Ether (eg 0.02 ether = 2%)
    function add(string memory _name, uint256 _stakingFee) public payable onlyLatestContract("rocketGroupAPI", address(this)) returns (bool) {
        // Get the contracts
        rocketGroupSettings = RocketGroupSettingsInterface(getContractAddress("rocketGroupSettings"));
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        // Check groups are currently allowed
        require(rocketGroupSettings.getNewAllowed() == true, "Group registrations are currently disabled in Rocket Pool");
        // Make the name lower case
        _name = _name.lower();
        // Check the name is ok
        require(bytes(_name).length > 2, "Group Name is to short, must be a minimum of 3 characters.");
        // Check the group name isn't already being used
        require(bytes(rocketStorage.getString(keccak256(abi.encodePacked("group.name", _name)))).length == 0, "Group name is already being used.");
        // Ok create the groups contract now, the address is their main ID and this is where the groups fees and more will reside
        address newContractAddress = address(new RocketGroupContract(address(rocketStorage), msg.sender, _stakingFee));
        // If there is a fee required to register a group, check that it is sufficient
        if(rocketGroupSettings.getNewFee() > 0) {
            // Fee correct?
            require(rocketGroupSettings.getNewFee() == msg.value, "New group fee insufficient.");
            // Transfer the fee amount now 
            rocketGroupSettings.getNewFeeAddress().transfer(msg.value);
            // Log it
            emit GroupAddFeeTransfer(newContractAddress, _name, msg.value, rocketGroupSettings.getNewFeeAddress(), now);
        }
        // Ok now set our data to key/value pair storage
        rocketStorage.setAddress(keccak256(abi.encodePacked("group.id", newContractAddress)), newContractAddress);
        rocketStorage.setString(keccak256(abi.encodePacked("group.name", newContractAddress)), _name);
        rocketStorage.setUint(keccak256(abi.encodePacked("group.fee", newContractAddress)), rocketGroupSettings.getDefaultFee());
        // Set the name as being used now
        rocketStorage.setString(keccak256(abi.encodePacked("group.name", _name)), _name);
        // Store our group address as an index set
        addressSetStorage.addItem(keccak256("groups.list"), newContractAddress); 
        // Log it
        emit GroupAdd(newContractAddress, _name, _stakingFee, now);
        // Done
        return true;
    }


    /// @dev Create a new default group accessor contract
    function createDefaultAccessor(address _ID) public onlyLatestContract("rocketGroupAPI", address(this)) returns (bool) {
        // Check that the group exists
        require(rocketStorage.getAddress(keccak256(abi.encodePacked("group.id", _ID))) != address(0x0), "Invalid group ID");
        // Create accessor contract
        rocketGroupAccessorFactory = RocketGroupAccessorFactory(getContractAddress("rocketGroupAccessorFactory"));
        address newAccessorAddress = rocketGroupAccessorFactory.createDefaultAccessor(_ID);
        // Emit creation event
        emit GroupCreateDefaultAccessor(_ID, newAccessorAddress, now);
        // Success
        return true;
    }


}
