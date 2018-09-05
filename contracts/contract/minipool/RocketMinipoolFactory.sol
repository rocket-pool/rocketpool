pragma solidity 0.4.24;

// Contracts
import "../../RocketBase.sol";
import "./RocketMinipool.sol";
// Interfaces
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";

/***
   * Note: Since this contract handles contract creation by other contracts, it's deployment gas usage will be high depending on the amount of contracts it can create.
***/ 

/// @title Creates minipool contracts for the nodes
/// @author David Rugendyke

contract RocketMinipoolFactory is RocketBase {


    /*** Contracts *************/

    RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(0);            // Settings for the minipools 

    
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

    /// @dev Create a new RocketMinipool contract, deploy to the etherverse and return the address to the caller
    /// @dev Note that the validation and logic for creation should be done in the calling contract
    /// @param _nodeOwner The node owner of the minipool contract
    /// @param _duration Staking duration in blocks of the minipool contract
    function createRocketMinipool(address _nodeOwner, uint256 _duration) public onlyLatestContract("rocketNodeAPI", msg.sender) returns(address) {
        // Ok create the nodes contract now, this is the address where their ether/rpl deposits will reside 
        RocketMinipool newContractAddress = new RocketMinipool(address(rocketStorage), _nodeOwner, _duration);
        // Do some initial checks
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        // Can we create one?
        require(rocketMinipoolSettings.getMinipoolCanBeCreated() == true, "Minipool creation is currently disabled.");
        // Store it now after a few checks
        if (addContract(keccak256(abi.encodePacked("rocketMinipool")), newContractAddress)) {
            return newContractAddress;
        }
    } 

    /// @dev Add the contract to our list of contract created contracts
    /// @param _newName The type/name of this contract
    /// @param _newContractAddress The address of this contract
    function addContract(bytes32 _newName, address _newContractAddress) private returns(bool) {
         // Basic error checking for the storage
        if (_newContractAddress != 0) {
            // Add the event now
            emit ContractCreated(_newName, _newContractAddress);
            // All good
            return true;
        }
        return false;
    } 

}