pragma solidity 0.8.18;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "./RocketMegapool.sol";
import "../../interface/megapool/RocketMegapoolFactoryInterface.sol";

contract RocketMegapoolFactory is RocketBase, RocketMegapoolFactoryInterface {
    // Events
    event ProxyCreated(address _address);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    /// @notice Gets the proxy bytecode
    function getProxyBytecode() override public pure returns (bytes memory) {
        return type(RocketMegapool).creationCode;
    }

    /// @notice Calculates the predetermined Megapool contract address from given node address
    /// @param _nodeAddress address of the node associated to the megapool
    function getProxyAddress(address _nodeAddress) override external view returns(address) {
        bytes memory contractCode = getProxyBytecode();
        bytes memory initCode = abi.encodePacked(contractCode, abi.encode(_nodeAddress, rocketStorage));

        bytes32 hash = keccak256(abi.encodePacked(bytes1(0xff), address(this), uint256(0), keccak256(initCode)));

        return address(uint160(uint(hash)));
    }

    /// @notice Uses CREATE2 to deploy a RocketMegapool at predetermined address
    /// @param _nodeAddress address of the node associated to the megapool
    function createProxy(address _nodeAddress) override external onlyLatestContract("rocketNodeManager", msg.sender) returns (address) {
        // Salt is not required as the initCode is already unique per node address (node address is constructor argument)
        RocketMegapool megapool = new RocketMegapool{salt: ''}(_nodeAddress, rocketStorage);
        setBool(keccak256(abi.encodePacked("megapool.exists", address(megapool))), true);
        emit ProxyCreated(address(megapool));
        return address(megapool);
    }
}
