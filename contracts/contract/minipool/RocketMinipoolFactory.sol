// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "./RocketMinipoolProxy.sol";
import "../RocketBase.sol";
import "../../types/MinipoolStatus.sol";
import "../../types/MinipoolDeposit.sol";
import "../../interface/dao/node/RocketDAONodeTrustedInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolManagerInterface.sol";
import "../../interface/minipool/RocketMinipoolQueueInterface.sol";
import "../../interface/node/RocketNodeStakingInterface.sol";
import "../../interface/util/AddressSetStorageInterface.sol";
import "../../interface/node/RocketNodeManagerInterface.sol";
import "../../interface/network/RocketNetworkPricesInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsMinipoolInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsNodeInterface.sol";
import "../../interface/minipool/RocketMinipoolFactoryInterface.sol";

/// @notice Performs CREATE2 deployment of minipool contracts
contract RocketMinipoolFactory is RocketBase, RocketMinipoolFactoryInterface {

    // Libs
    using SafeMath for uint;

    constructor(RocketStorageInterface _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        version = 2;
    }

    /// @notice Returns the bytecode for RocketMinipool
    function getMinipoolBytecode() override public pure returns (bytes memory) {
        return type(RocketMinipoolProxy).creationCode;
    }

    /// @notice Performs a CREATE2 deployment of a minipool contract with given salt
    /// @param _nodeAddress Owning node operator's address
    /// @param _salt A salt used in determining minipool address
    function deployContract(address _nodeAddress, uint256 _salt) override external onlyLatestContract("rocketMinipoolFactory", address(this)) onlyLatestContract("rocketMinipoolManager", msg.sender) returns (address) {
        // Construct deployment bytecode
        bytes memory creationCode = getMinipoolBytecode();
        bytes memory bytecode = abi.encodePacked(creationCode, abi.encode(rocketStorage, _nodeAddress));
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
        // Initialise the minipool storage
        RocketMinipoolInterface(contractAddress).initialise(_nodeAddress);
        // Return address
        return contractAddress;
    }

}
