pragma solidity 0.5.8;


import "./RocketBase.sol";
import "./interface/utils/lists/AddressSetStorageInterface.sol";


/// @title Upgrade approval system for Rocket Pool network contracts
/// @author David Rugendyke
contract RocketUpgradeApproval is RocketBase {


    /*** Contracts **************/

    AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(0); // Address storage utility


    /*** Events ****************/

    event ApproverTransferred (
        address indexed _oldApproverAddress,
        address indexed _newApproverAddress,
        uint256 created
    );


    /*** Modifiers ***********/


    /// @dev Must be called by an upgrade approver
    modifier onlyUpgradeApprover() {
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        require(addressSetStorage.getIndexOf(keccak256(abi.encodePacked("upgrade.approvers")), msg.sender) != -1, "Sender must be an upgrade approver");
        _;
    }


    /*** Constructor ***********/    

    /// @dev RocketUpgrade constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Set the version
        version = 1;
    }


    /**** Approval Account Methods ***********/


    /// @dev Initialise the upgrade approvers
    /// @param _approvers A list of upgrade approver addresses
    function initialiseUpgradeApprovers(address[] memory _approvers) onlySuperUser public {
        // Initialise contracts
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        // Check initialisation status
        require(addressSetStorage.getCount(keccak256(abi.encodePacked("upgrade.approvers"))) == 0, "Upgrade approvers have already been initialised");
        // Check and initialise upgrade approvers
        require(_approvers.length == 3, "Exactly 3 upgrade approvers are required");
        for (uint256 i = 0; i < _approvers.length; ++i) {
            require(_approvers[i] != address(0x0), "Invalid upgrade approver address");
            require(addressSetStorage.getIndexOf(keccak256(abi.encodePacked("upgrade.approvers")), _approvers[i]) == -1, "Upgrade approver address already used");
            addressSetStorage.addItem(keccak256(abi.encodePacked("upgrade.approvers")), _approvers[i]);
        }
    }


    /// @dev Transfer upgrade approver privileges to another address
    /// @dev Requires confirmation by 2/3 of upgrade approvers
    function transferUpgradeApprover(address _oldAddress, address _newAddress) onlyUpgradeApprover public {
        // Initialise contracts
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        // Check addresses
        require(_newAddress != address(0x0), "Invalid new upgrade approver address");
        require(addressSetStorage.getIndexOf(keccak256(abi.encodePacked("upgrade.approvers")), _newAddress) == -1, "New upgrade approver address already in use");
        require(addressSetStorage.getIndexOf(keccak256(abi.encodePacked("upgrade.approvers")), _oldAddress) != -1, "Old upgrade approver address not found");
        // Check for initialisation of this transfer
        address transferInitialisedBy = rocketStorage.getAddress(keccak256(abi.encodePacked("upgrade.approver.transfer.init", _oldAddress, _newAddress)));
        require(transferInitialisedBy != msg.sender, "Transfer was initialised by this approver");
        // Complete transfer if already initialised
        if (transferInitialisedBy != address(0x0)) {
            rocketStorage.deleteAddress(keccak256(abi.encodePacked("upgrade.approver.transfer.init", _oldAddress, _newAddress)));
            // Transfer approver privileges
            addressSetStorage.removeItem(keccak256(abi.encodePacked("upgrade.approvers")), _oldAddress);
            addressSetStorage.addItem(keccak256(abi.encodePacked("upgrade.approvers")), _newAddress);
            // Emit transfer event
            emit ApproverTransferred(_oldAddress, _newAddress, now);
        }
        // Initialise transfer if not initialised yet
        else {
            rocketStorage.setAddress(keccak256(abi.encodePacked("upgrade.approver.transfer.init", _oldAddress, _newAddress)), msg.sender);
        }
    }


}
