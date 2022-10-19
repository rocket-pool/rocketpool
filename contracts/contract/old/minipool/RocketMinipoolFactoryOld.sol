pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../../minipool/RocketMinipool.sol";
import "../../RocketBase.sol";
import "../../../types/MinipoolStatus.sol";
import "../../../types/MinipoolDeposit.sol";
import "../../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import "../../../interface/minipool/RocketMinipoolInterface.sol";
import "../../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../../interface/minipool/RocketMinipoolQueueInterface.sol";
import "../../../interface/node/RocketNodeStakingInterface.sol";
import "../../../interface/util/AddressSetStorageInterface.sol";
import "../../../interface/node/RocketNodeManagerInterface.sol";
import "../../../interface/network/RocketNetworkPricesInterface.sol";
import "../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import "../../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol";
import "../../../interface/old/RocketMinipoolFactoryInterfaceOld.sol";

// Minipool creation, removal and management

contract RocketMinipoolFactoryOld is RocketBase, RocketMinipoolFactoryInterfaceOld {

    // Libs
    using SafeMath for uint;

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 1;
    }

    // Returns the bytecode for RocketMinipool
    function getMinipoolBytecode() override public pure returns (bytes memory) {
        return type(RocketMinipool).creationCode;
    }

    // Performs a CREATE2 deployment of a minipool contract with given salt
    function deployContract(address _nodeAddress, MinipoolDeposit _depositType, uint256 _salt) override external onlyLatestContract("rocketMinipoolFactory", address(this)) onlyLatestContract("rocketMinipoolManager", msg.sender) returns (address) {
        // Construct deployment bytecode
        bytes memory creationCode = getMinipoolBytecode();
        bytes memory bytecode = abi.encodePacked(creationCode, abi.encode(rocketStorage, _nodeAddress, _depositType));
        // Construct final salt
        uint256 salt = uint256(keccak256(abi.encodePacked(_nodeAddress, _salt)));
        // CREATE2 deployment
        address contractAddress;
        uint256 codeSize;
        assembly {
            contractAddress := create2(
            0,
            add(bytecode, 0x20),
            mload(bytecode),
            salt
            )

            codeSize := extcodesize(contractAddress)
        }
        // Ensure deployment was successful
        require(codeSize > 0, "Contract creation failed");
        // Return address
        return contractAddress;
    }

}
