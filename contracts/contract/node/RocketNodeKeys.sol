pragma solidity 0.5.8;


import "../../RocketBase.sol";


/// @title RocketNodeKeys - manages node validator keys
/// @author Jake Pospischil

contract RocketNodeKeys is RocketBase {


    /*** Modifiers **************/


    /// @dev Only passes if _nodeOwner is a registered node owner
    modifier onlyValidNodeOwner(address _nodeOwner) {
        require(rocketStorage.getBool(keccak256(abi.encodePacked("node.exists", _nodeOwner))) == true, "Node owner is not valid.");
        _;
    }


    /// @dev Only passes if _nodeContract exists and is registered to _nodeOwner
    modifier onlyValidNodeContract(address _nodeOwner, address _nodeContract) {
        require(rocketStorage.getAddress(keccak256(abi.encodePacked("node.contract", _nodeOwner))) == _nodeContract, "Node contract is not valid.");
        _;
    }


    /*** Methods ****************/


    // Constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }


    /// @dev Validate a validator pubkey
    /// @param _validatorPubkey The validator's pubkey
    function validatePubkey(bytes memory _validatorPubkey) public view {
        // Check pubkey
        require(!rocketStorage.getBool(keccak256(abi.encodePacked("validator.pubkey.used", _validatorPubkey))), "Validator pubkey is already in use");
    }


    /// @dev Reserve a validator pubkey used by a node
    /// @param _validatorPubkey The validator's pubkey
    /// @param _reserve Whether to reserve or free the pubkey
    function reservePubkey(address _nodeOwner, bytes memory _validatorPubkey, bool _reserve) public onlyValidNodeOwner(_nodeOwner) onlyValidNodeContract(_nodeOwner, msg.sender) {
        // Record pubkey usage
        rocketStorage.setBool(keccak256(abi.encodePacked("validator.pubkey.used", _validatorPubkey)), _reserve);
    }


}
