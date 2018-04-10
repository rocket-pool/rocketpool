pragma solidity 0.4.19;


import "./RocketBase.sol";


/// @title The RocketNodeBase contract for shared node functionality.
/// @author Rocket Pool
contract RocketNodeBase is RocketBase {

    /// @dev Only registered pool node addresses can access
    /// @param _nodeAccountAddress node account address.
    modifier onlyRegisteredNode(address _nodeAccountAddress) {
        require(rocketStorage.getBool(keccak256("node.exists", _nodeAccountAddress)));
        _;
    }

    /// @dev rocket node base constructor
    function RocketNodeBase(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }

    /// @dev Returns the amount of registered rocket nodes
    function getNodeCount() public view returns(uint) {
        return rocketStorage.getUint(keccak256("nodes.total"));
    }
    
}