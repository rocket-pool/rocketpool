pragma solidity 0.5.0;


import "../../RocketBase.sol";
import "../../contract/group/RocketGroupAccessorContract.sol";


/// @dev Creates default Rocket Group Accessor contracts
/// @author Jake Pospischil

contract RocketGroupAccessorFactory is RocketBase {


    /*** Constructor ************/


    /// @dev rocketGroup constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }


    /*** Methods ****************/


    /// @dev Create a new default group accessor contract
    function createDefaultAccessor(address _ID) public onlyLatestContract("rocketGroupAPI", msg.sender) returns (address) {
        return address(new RocketGroupAccessorContract(address(rocketStorage), _ID));
    }


}
