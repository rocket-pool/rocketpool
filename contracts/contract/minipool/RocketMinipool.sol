pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "./RocketMinipoolStorageLayout.sol";
import "../../interface/RocketStorageInterface.sol";
import "../../interface/network/RocketNetworkFeesInterface.sol";
import "../../types/MinipoolDeposit.sol";
import "../../types/MinipoolStatus.sol";

// An individual minipool in the Rocket Pool network

contract RocketMinipool is RocketMinipoolStorageLayout {

    // Events
    event EtherReceived(address indexed from, uint256 amount, uint256 time);

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress, address _nodeAddress, MinipoolDeposit _depositType) {
        // Check parameters
        require(address(_rocketStorageAddress) != address(0x0), "Invalid storage address");
        require(_nodeAddress != address(0x0), "Invalid node address");
        require(_depositType != MinipoolDeposit.None, "Invalid deposit type");
        // Initialise RocketStorage
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
        // Load contracts
        RocketNetworkFeesInterface rocketNetworkFees = RocketNetworkFeesInterface(getContractAddress("rocketNetworkFees"));
        // Set initial status
        status = MinipoolStatus.Initialized;
        statusBlock = block.number;
        statusTime = block.timestamp;
        // Set details
        depositType = _depositType;
        nodeAddress = _nodeAddress;
        nodeFee = rocketNetworkFees.getNodeFee();
        // Set safety check flag
        initialised = true;
    }

    // Receive an ETH deposit
    receive() external payable {
        // Emit ether received event
        emit EtherReceived(msg.sender, msg.value, block.timestamp);
    }

    // Delegate all other calls to minipool delegate contract
    fallback(bytes calldata _input) external payable returns (bytes memory) {
        (bool success, bytes memory data) = getContractAddress("rocketMinipoolDelegate").delegatecall(_input);
        if (!success) { revert(getRevertMessage(data)); }
        return data;
    }

    // Get the address of a Rocket Pool network contract
    function getContractAddress(string memory _contractName) private view returns (address) {
        address contractAddress = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", _contractName)));
        require(contractAddress != address(0x0), "Contract not found");
        return contractAddress;
    }

    // Get a revert message from delegatecall return data
    function getRevertMessage(bytes memory _returnData) private pure returns (string memory) {
        if (_returnData.length < 68) { return "Transaction reverted silently"; }
        assembly {
            _returnData := add(_returnData, 0x04)
        }
        return abi.decode(_returnData, (string));
    }

}
