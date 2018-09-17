pragma solidity 0.4.24;


import "../../interface/node/RocketNodeTaskInterface.sol";
import "../../interface/utils/lists/AddressListStorageInterface.sol";


/// @title RocketNodeTasks - manages tasks to be performed on node checkin
/// @author Jake Pospischil

contract RocketNodeTasks is RocketBase {


    /*** Contracts **************/


    AddressListStorageInterface addressListStorage = AddressListStorageInterface(0);


    /*** Methods ****************/


    /// @dev Constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }


    /// @dev Add a new task to be performed on checkin
    /// @param _taskAddress The address of the task contract to be run
    /// @param _index The index to insert the task at; negative numbers denote the end of the queue
    function add(address _taskAddress, int _index) external onlySuperUser() returns (bool) {

    }


    /// @dev Remove a checkin task
    /// @param _index The index of the checkin task to be removed
    function remove(uint _index) external onlySuperUser() returns (bool) {

    }


    /// @dev Update a checkin task
    /// @param _taskAddress The new address of the task contract to be run
    /// @param _index The index of the checkin task to be updated
    function update(address _taskAddress, uint _index) external onlySuperUser() returns (bool) {

    }


}
