pragma solidity 0.6.8;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/minipool/RocketMinipoolStatusInterface.sol";
import "../../interface/util/AddressSetStorageInterface.sol";

// Handles updates to minipool status
// Includes status updates initiated by RP network contracts, the minipool owner, and trusted (oracle) nodes

contract RocketMinipoolStatus is RocketBase, RocketMinipoolStatusInterface {

    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }

    // Only allow access from the registered owner of a minipool
    modifier onlyMinipoolOwner(address _minipoolAddress, address _nodeAddress) {
        require(isMinipoolOwner(_minipoolAddress, _nodeAddress), "Invalid minipool owner");
        _;
    }

    // Check whether a node is the registered owner of a minipool
    function isMinipoolOwner(address _minipoolAddress, address _nodeAddress) private view returns (bool) {
        AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(getContractAddress("addressSetStorage"));
        return (addressSetStorage.getIndexOf(keccak256(abi.encodePacked("node.minipools.index", _nodeAddress)), _minipoolAddress) != -1);
    }

    // Assign the node deposit to the minipool
    // Only accepts calls from the RocketNodeDeposit contract
    function nodeDepositMinipool(address _minipool) override external payable onlyLatestContract("rocketNodeDeposit", msg.sender) {
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipool);
        minipool.nodeDeposit{value: msg.value}();
    }

    // Assign user deposited ETH to a minipool and mark it as prelaunch
    // Only accepts calls from the RocketDepositPool contract
    function userDepositMinipool(address _minipool) override external payable onlyLatestContract("rocketDepositPool", msg.sender) {
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipool);
        minipool.userDeposit{value: msg.value}();
    }

    // Progress a minipool to staking, sending its ETH deposit to the VRC
    // Only accepts calls from the registered owner (node) of the minipool
    function stakeMinipool(address _minipool, bytes calldata _validatorPubkey, bytes calldata _validatorSignature, bytes32 _depositDataRoot) external onlyMinipoolOwner(_minipool, msg.sender) {}

    // Mark a minipool as exited
    // Only accepts calls from trusted (oracle) nodes
    function exitMinipool(address _minipool) external onlyTrustedNode(msg.sender) {}

    // Mark a minipool as withdrawable and record its final balance
    // Only accepts calls from trusted (oracle) nodes
    function withdrawMinipool(address _minipool, uint256 _withdrawalBalance) external onlyTrustedNode(msg.sender) {
        // 1. Calculate the share of the validator balance for the node operator
        // 2. Mint nETH equal to the node operator's share to the minipool contract
        // 3. Mark the minipool as withdrawable
    }

    // Withdraw rewards from a minipool and close it
    // Only accepts calls from the registered owner (node) of the minipool
    function closeMinipool(address _minipool) external onlyMinipoolOwner(_minipool, msg.sender) {}

    // Dissolve a minipool, closing it and returning all balances to the node operator and the deposit pool
    // Only accepts calls from the registered owner (node) of the minipool, or from any address if the minipool has timed out
    function dissolveMinipool(address _minipool) external {}

}
