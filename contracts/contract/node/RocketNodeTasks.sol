pragma solidity 0.4.24;


import "../../RocketBase.sol";
import "../../interface/node/RocketNodeTaskInterface.sol";
import "../../interface/utils/lists/AddressListStorageInterface.sol";


/// @title RocketNodeTasks - manages tasks to be performed on node checkin
/// @author Jake Pospischil

contract RocketNodeTasks is RocketBase {


    /*** Contracts **************/


    AddressListStorageInterface addressListStorage = AddressListStorageInterface(0);


    /*** Modifiers *************/


    /// @dev requires that the _node address is a valid node in the Rocket Pool network
    modifier onlyValidRocketNode(address _node) {
        // TODO: implement
        _;
    }


    /*** Methods ****************/


    /// @dev Constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }


    /// @dev Run all tasks
    function run() external onlyValidRocketNode(msg.sender) {
        // Get list storage
        addressListStorage = AddressListStorageInterface(getContractAddress("utilAddressListStorage"));
        // Run tasks
        uint256 count = addressListStorage.getListCount(keccak256("node.tasks"));
        for (uint256 i = 0; i < count; ++i) {
            RocketNodeTaskInterface task = RocketNodeTaskInterface(addressListStorage.getListItem(keccak256("node.tasks"), i));
            task.run(msg.sender);
        }
    }


    /// @dev Get the total number of tasks
    function getTaskCount() external returns (uint256) {
        addressListStorage = AddressListStorageInterface(getContractAddress("utilAddressListStorage"));
        return addressListStorage.getListCount(keccak256("node.tasks"));
    }


    /// @dev Get a task contract address by index
    function getTaskAddressAt(uint256 _index) external returns (address) {
        addressListStorage = AddressListStorageInterface(getContractAddress("utilAddressListStorage"));
        return addressListStorage.getListItem(keccak256("node.tasks"), _index);
    }


    /// @dev Get a task contract name by index
    function getTaskNameAt(uint256 _index) external returns (string) {
        addressListStorage = AddressListStorageInterface(getContractAddress("utilAddressListStorage"));
        RocketNodeTaskInterface task = RocketNodeTaskInterface(addressListStorage.getListItem(keccak256("node.tasks"), _index));
        return task.name();
    }


    /// @dev Add a new task to be performed on checkin
    /// @param _taskAddress The address of the task contract to be run
    function add(address _taskAddress) external onlySuperUser() returns (bool) {
        // Check task contract address
        require(_taskAddress != 0x0, "Invalid task contract address");
        // Get list storage
        addressListStorage = AddressListStorageInterface(getContractAddress("utilAddressListStorage"));
        // Insert task contract address
        addressListStorage.pushListItem(keccak256("node.tasks"), _taskAddress);
        // Return success flag
        return true;
    }


    /// @dev Remove a checkin task
    /// @param _index The index of the checkin task to be removed
    function remove(uint _index) external onlySuperUser() returns (bool) {
        // Get list storage
        addressListStorage = AddressListStorageInterface(getContractAddress("utilAddressListStorage"));
        // Remove checkin task
        addressListStorage.removeUnorderedListItem(keccak256("node.tasks"), _index);
        // Return success flag
        return true;
    }


    /// @dev Update a checkin task
    /// @param _taskAddress The new address of the task contract to be run
    /// @param _index The index of the checkin task to be updated
    function update(address _taskAddress, uint _index) external onlySuperUser() returns (bool) {
        // Check task contract address
        require(_taskAddress != 0x0, "Invalid task contract address");
        // Get list storage
        addressListStorage = AddressListStorageInterface(getContractAddress("utilAddressListStorage"));
        // Update task contract address
        addressListStorage.setListItem(keccak256("node.tasks"), _index, _taskAddress);
        // Return success flag
        return true;
    }


}
