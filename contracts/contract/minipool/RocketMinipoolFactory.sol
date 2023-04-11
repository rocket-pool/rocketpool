// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

import "../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolBaseInterface.sol";
import "../../interface/minipool/RocketMinipoolFactoryInterface.sol";

/// @notice Performs CREATE2 deployment of minipool contracts
contract RocketMinipoolFactory is RocketBase, RocketMinipoolFactoryInterface {

    // Libs
    using SafeMath for uint;
    using Clones for address;

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 2;
    }

    /// @notice Returns the expected minipool address for a node operator given a user-defined salt
    /// @param _salt The salt used in minipool creation
    function getExpectedAddress(address _nodeOperator, uint256 _salt) external override view returns (address) {
        // Ensure rocketMinipoolBase is setAddress
        address rocketMinipoolBase = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", "rocketMinipoolBase")));
        // Calculate node specific salt value
        bytes32 salt = keccak256(abi.encodePacked(_nodeOperator, _salt));
        // Return expected address
        return rocketMinipoolBase.predictDeterministicAddress(salt, address(this));
    }

    /// @notice Performs a CREATE2 deployment of a minipool contract with given salt
    /// @param _nodeAddress Owning node operator's address
    /// @param _salt A salt used in determining minipool address
    function deployContract(address _nodeAddress, uint256 _salt) override external onlyLatestContract("rocketMinipoolFactory", address(this)) onlyLatestContract("rocketMinipoolManager", msg.sender) returns (address) {
        // Ensure rocketMinipoolBase is setAddress
        address rocketMinipoolBase = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", "rocketMinipoolBase")));
        require(rocketMinipoolBase != address(0));
        // Construct final salt
        bytes32 salt = keccak256(abi.encodePacked(_nodeAddress, _salt));
        // Deploy the minipool
        address proxy = rocketMinipoolBase.cloneDeterministic(salt);
        // Initialise the minipool storage
        RocketMinipoolBaseInterface(proxy).initialise(address(rocketStorage), _nodeAddress);
        // Return address
        return proxy;
    }

}
