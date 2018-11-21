pragma solidity 0.5.0;


import "../../RocketBase.sol";
import "../../interface/node/RocketNodeTaskInterface.sol";
import "../../interface/utils/lists/AddressSetStorageInterface.sol";


/// @title RocketNodeTasks - manages tasks to be performed on node checkin
/// @author Jake Pospischil

contract RocketNodeTasks is RocketBase {


    /*** Contracts **************/


    AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(0);


    /*** Modifiers *************/


    /// @dev requires that the _node address is a valid node in the Rocket Pool network
    modifier onlyValidRocketNode(address _node) {
        require(rocketStorage.getBool(keccak256(abi.encodePacked("node.exists", _node))), "Caller must be a valid node owner");
        _;
    }


    /*** Methods ****************/


    /// @dev Constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }


    /// @dev Run all tasks
    function run() external onlyValidRocketNode(msg.sender) {
        // Get set storage
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        // Run tasks
        uint256 count = addressSetStorage.getCount(keccak256("node.tasks"));
        for (uint256 i = 0; i < count; ++i) {
            RocketNodeTaskInterface task = RocketNodeTaskInterface(addressSetStorage.getItem(keccak256("node.tasks"), i));
            task.run(msg.sender);
        }
    }


    /// @dev Run a single task by address
    function runOne(address _taskAddress) external onlyValidRocketNode(msg.sender) {
        RocketNodeTaskInterface task = RocketNodeTaskInterface(_taskAddress);
        task.run(msg.sender);
    }


    /// @dev Get the total number of tasks
    function getTaskCount() external returns (uint256) {
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        return addressSetStorage.getCount(keccak256("node.tasks"));
    }


    /// @dev Get a task contract address by index
    function getTaskAddressAt(uint256 _index) external returns (address) {
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        return addressSetStorage.getItem(keccak256("node.tasks"), _index);
    }


    /// @dev Get a task contract name by index
    function getTaskNameAt(uint256 _index) external returns (string memory) {
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        RocketNodeTaskInterface task = RocketNodeTaskInterface(addressSetStorage.getItem(keccak256("node.tasks"), _index));
        return task.name();
    }


    /// @dev Get the index of a task contract in the task list
    function getTaskIndexOf(address _taskAddress) external returns (int) {
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        return addressSetStorage.getIndexOf(keccak256("node.tasks"), _taskAddress);
    }


    /// @dev Add a new task to be performed on checkin
    /// @param _taskAddress The address of the task contract to be added
    function add(address _taskAddress) external onlySuperUser() returns (bool) {
        // Check task contract address
        require(_taskAddress != address(0x0), "Invalid task contract address");
        // Get set storage
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        // Insert task contract address
        addressSetStorage.addItem(keccak256("node.tasks"), _taskAddress);
        // Return success flag
        return true;
    }


    /// @dev Remove a checkin task
    /// @param _taskAddress The address of the task contract to be removed
    function remove(address _taskAddress) external onlySuperUser() returns (bool) {
        // Get set storage
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        // Remove checkin task
        addressSetStorage.removeItem(keccak256("node.tasks"), _taskAddress);
        // Return success flag
        return true;
    }


    /// @dev Update a checkin task
    /// @param _oldAddress The old address of the task contract
    /// @param _newAddress The new address of the task contract
    function update(address _oldAddress, address _newAddress) external onlySuperUser() returns (bool) {
        // Check task contract address
        require(_newAddress != address(0x0), "Invalid task contract address");
        // Get set storage
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        // Update task contract address
        addressSetStorage.addItem(keccak256("node.tasks"), _newAddress);
        addressSetStorage.removeItem(keccak256("node.tasks"), _oldAddress);
        // Return success flag
        return true;
    }


}
