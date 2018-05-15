pragma solidity 0.4.23;


import "./RocketBase.sol";
import "./RocketPoolMini.sol";
import "./interface/RocketStorageInterface.sol";

/***
   * Note: Since this contract handles contract creation by other contracts, it's deployment gas usage will be high depending on the amount of contracts it can create.
   * For the moment it supports the RocketPoolMini creations, but if more automatic contract creations are added, be wary of the gas for deployment as it may exceed the block gas limit
***/ 

/// @title Where we build the rockets! New contracts created by Rocket Pool are done here so they can be tracked.
/// @author David Rugendyke
contract RocketFactory is RocketBase {

    
    /*** Events *************/

    event ContractCreated (
        bytes32 name, 
        address contractAddress
    );


    /*** Modifiers ***************/

    /// @dev Only allow access from the latest version of these RocketPool contracts
    modifier onlyLatestRocketPool() {
        require(msg.sender == rocketStorage.getAddress(keccak256("contract.name", "rocketPool")));
        _;
    }


    /*** Methods ***************/

    /// @dev RocketFactory constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }

    /// @dev Create a new RocketPoolMini contract, deploy to the etherverse and return the address to the caller
    /// @dev Note that the validation and logic for creation should be done in the calling contract
    /// @param _miniPoolStakingDuration The staking duration for the mini pool
    function createRocketPoolMini(uint256 _miniPoolStakingDuration) public onlyLatestRocketPool returns(address) {
        // Create the new pool and add it to our list
        RocketPoolMini newPoolAddress = new RocketPoolMini(address(rocketStorage), _miniPoolStakingDuration);
        // Store it now after a few checks
        if (addContract(keccak256("rocketMiniPool"), newPoolAddress)) {
            return newPoolAddress;
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