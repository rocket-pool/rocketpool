pragma solidity 0.5.0;


import "../../RocketBase.sol";


/// @title RocketNodeKeys - manages node validator keys
/// @author Jake Pospischil

contract RocketNodeKeys is RocketBase {


    /*** Properties *************/


    // DepositInput field byte indices
    uint256 constant pubkeyStart = 4;
    uint256 constant pubkeyEnd = 52;
    uint256 constant withdrawalCredentialsStart = 52;
    uint256 constant withdrawalCredentialsEnd = 84;


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


    /// @dev Validate a deposit input object
    /// @param _depositInput The simple serialized deposit input
    function validateDepositInput(bytes memory _depositInput) public view {
        // Rocket Pool withdrawal credentials
        // TODO: replace with real value; this uses a hash of pubkey 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
        bytes memory rpWithdrawalCredentials = hex"00d234647c45290c9884ba3aceccc7da5cfd19cfa5ccfed70fe75712578d3bb1";
        // Check deposit input withdrawal credentials
        bool wcMatch = true;
        for (uint256 i = 0; i < withdrawalCredentialsEnd - withdrawalCredentialsStart; ++i) {
            if (rpWithdrawalCredentials[i] != _depositInput[i + withdrawalCredentialsStart]) {
                wcMatch = false;
                break;
            }
        }
        require(wcMatch, "Invalid deposit input withdrawal credentials");
        // Get pubkey from deposit input data
        bytes memory pubkey = getDepositInputPubkey(_depositInput);
        // Check pubkey
        require(!rocketStorage.getBool(keccak256(abi.encodePacked("validator.pubkey.used", pubkey))), "Validator pubkey is already in use");
    }


    /// @dev Reserve a validator pubkey used by a node
    /// @param _depositInput The simple serialized deposit input containing the validator pubkey
    /// @param _reserve Whether to reserve or free the pubkey
    function reservePubkey(address _nodeOwner, bytes memory _depositInput, bool _reserve) public onlyValidNodeOwner(_nodeOwner) onlyValidNodeContract(_nodeOwner, msg.sender) {
        // Get pubkey from deposit input data
        bytes memory pubkey = getDepositInputPubkey(_depositInput);
        // Record pubkey usage
        rocketStorage.setBool(keccak256(abi.encodePacked("validator.pubkey.used", pubkey)), _reserve);
    }


    /// @dev Extract a validator pubkey from a deposit input object
    /// @param _depositInput The simple serialized deposit input containing the validator pubkey
    function getDepositInputPubkey(bytes memory _depositInput) private pure returns (bytes memory) {
        bytes memory pubkey = new bytes(pubkeyEnd - pubkeyStart);
        for (uint256 i = 0; i < pubkeyEnd - pubkeyStart; ++i) {
            pubkey[i] = _depositInput[i + pubkeyStart];
        }
        return pubkey;
    }


}
