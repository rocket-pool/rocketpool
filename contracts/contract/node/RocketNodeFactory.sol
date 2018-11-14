pragma solidity 0.4.24;

// Contracts
import "../../RocketBase.sol";
import "./RocketNodeContract.sol";
// Interfaces
import "../../interface/settings/RocketNodeSettingsInterface.sol";

/***
   * Note: Since this contract handles contract creation by other contracts, it's deployment gas usage will be high depending on the amount of contracts it can create.
***/ 

/// @title Creates contracts for the nodes, only their primary node contract atm
/// @author David Rugendyke

contract RocketNodeFactory is RocketBase {

    /*** Contracts *************/

    RocketNodeSettingsInterface rocketNodeSettings = RocketNodeSettingsInterface(0);            // Settings for the minipools 

    
    /*** Events *************/

    event ContractCreated (
        bytes32 name, 
        address contractAddress
    );


    /*** Methods ***************/

    /// @dev RocketFactory constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }

    /// @dev Create a new RocketNodeContract contract, deploy to the etherverse and return the address to the caller
    /// @dev Note that the validation and logic for creation should be done in the calling contract
    /// @param _nodeOwnerAddress The owner of the node contract
    function createRocketNodeContract(address _nodeOwnerAddress) public onlyLatestContract("rocketNodeAPI", msg.sender) returns(address) {
        // Ok create the nodes contract now, this is the address where their ether/rpl deposits will reside
        RocketNodeContract newContractAddress = new RocketNodeContract(address(rocketStorage), _nodeOwnerAddress);
        // Do some initial checks
        rocketNodeSettings = RocketNodeSettingsInterface(getContractAddress("rocketNodeSettings"));
        // Can we create one?
        require(rocketNodeSettings.getNewAllowed() == true, "New node contract creation is currently disabled.");
        // Emit created event
        emit ContractCreated(keccak256(abi.encodePacked("rocketNodeContract")), newContractAddress);
        // Return contract address
        return newContractAddress;
    }

}