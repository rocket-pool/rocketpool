// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {RocketStorageInterface} from "../../interface/RocketStorageInterface.sol";
import {RocketMegapoolDelegateBaseInterface} from "../../interface/megapool/RocketMegapoolDelegateBaseInterface.sol";
import {RocketMegapoolProxyInterface} from "../../interface/megapool/RocketMegapoolProxyInterface.sol";
import {RocketMegapoolStorageLayout} from "./RocketMegapoolStorageLayout.sol";

/// @notice Contains the initialisation and delegate upgrade logic for megapools.
///         All other calls are delegated to the node operator's current delegate or optionally the latest.
contract RocketMegapoolProxy is RocketMegapoolProxyInterface, RocketMegapoolStorageLayout {
    // Events
    event EtherReceived(address indexed from, uint256 amount, uint256 time);
    event DelegateUpgraded(address oldDelegate, address newDelegate, uint256 time);
    event UseLatestUpdated(bool state, uint256 time);

    // Immutables
    address immutable private self;
    RocketStorageInterface immutable private rocketStorage;

    // Construct
    constructor (RocketStorageInterface _rocketStorage) {
        self = address(this);
        rocketStorage = _rocketStorage;
    }

    /// @dev Prevent direct calls to this contract
    modifier notSelf() {
        require(address(this) != self);
        _;
    }

    /// @dev Only allow access from the owning node address
    modifier onlyMegapoolOwner() {
        // Only the node operator can upgrade
        address withdrawalAddress = rocketStorage.getNodeWithdrawalAddress(nodeAddress);
        require(msg.sender == nodeAddress || msg.sender == withdrawalAddress, "Only the node operator can access this method");
        _;
    }

    /// @notice Sets up the initial delegate
    /// @param _nodeAddress The owner of this megapool
    function initialise(address _nodeAddress) external override notSelf {
        // Check input
        require(_nodeAddress != address(0), "Invalid node address");
        require(!storageState, "Already initialised");
        // Flag storage state as initialised and record node address
        storageState = true;
        nodeAddress = _nodeAddress;
        // Set the current delegate (checking it exists)
        address delegateAddress = getContractAddress("rocketMegapoolDelegate");
        require(contractExists(delegateAddress), "Delegate contract does not exist");
        rocketMegapoolDelegate = delegateAddress;
    }

    /// @notice Receive an ETH deposit
    receive() external payable notSelf {
        // Emit ether received event
        emit EtherReceived(msg.sender, msg.value, block.timestamp);
    }

    /// @notice Delegates all other calls to megapool delegate contract (or latest if flag is set)
    /// @param _input Transaction calldata that is passed directly to the delegate
    fallback(bytes calldata _input) external payable notSelf returns (bytes memory) {
        address delegateContract;
        // If useLatestDelegate is set, use the latest delegate contract otherwise use stored and check expiry
        if (useLatestDelegate) {
            delegateContract = getContractAddress("rocketMegapoolDelegate");
        } else {
            require(!getDelegateExpired(), "Delegate has expired");
            delegateContract = rocketMegapoolDelegate;
        }
        // Check for contract existence
        require(contractExists(delegateContract), "Delegate contract does not exist");
        // Execute delegatecall on the delegate contract
        (bool success, bytes memory data) = delegateContract.delegatecall(_input);
        if (!success) {
            revert(getRevertMessage(data));
        }
        return data;
    }

    /// @notice Upgrade this megapool to the latest network delegate contract
    function delegateUpgrade() public override notSelf {
        // Only owner can upgrade if delegate hasn't expired
        if (!getDelegateExpired()) {
            address withdrawalAddress = rocketStorage.getNodeWithdrawalAddress(nodeAddress);
            require(msg.sender == nodeAddress || msg.sender == withdrawalAddress, "Only the node operator can access this method");
        }
        // Only succeed if there is a new delegate to upgrade to
        address oldDelegate = rocketMegapoolDelegate;
        address newDelegate = getContractAddress("rocketMegapoolDelegate");
        require(oldDelegate != newDelegate, "Already using latest");
        // Set new delegate
        rocketMegapoolDelegate = newDelegate;
        // Log event
        emit DelegateUpgraded(oldDelegate, newDelegate, block.timestamp);
    }

    /// @notice Sets the flag to automatically use the latest delegate contract or not
    /// @param _state If true, will always use the latest delegate contract
    function setUseLatestDelegate(bool _state) external override onlyMegapoolOwner notSelf {
        useLatestDelegate = _state;
        emit UseLatestUpdated(_state, block.timestamp);
        if (!_state) {
            // Upon disabling use latest, set their current delegate to the latest
            address newDelegate = getContractAddress("rocketMegapoolDelegate");
            if (newDelegate != rocketMegapoolDelegate) {
                delegateUpgrade();
            }
        }
    }

    /// @notice Returns true if this megapool always uses the latest delegate contract
    function getUseLatestDelegate() external override view returns (bool) {
        return useLatestDelegate;
    }

    /// @notice Returns the address of the megapool's stored delegate
    function getDelegate() external override view returns (address) {
        return rocketMegapoolDelegate;
    }

    /// @notice Returns the delegate which will be used when calling this megapool taking into account useLatestDelegate setting
    function getEffectiveDelegate() external override view returns (address) {
        return useLatestDelegate ? getContractAddress("rocketMegapoolDelegate") : rocketMegapoolDelegate;
    }

    /// @notice Returns true if the megapools current delegate has expired
    function getDelegateExpired() public view returns (bool) {
        RocketMegapoolDelegateBaseInterface megapoolDelegate = RocketMegapoolDelegateBaseInterface(rocketMegapoolDelegate);
        uint256 expiry = megapoolDelegate.getExpirationBlock();
        return expiry != 0 && block.number >= expiry;
    }

    /// @dev Get the address of a Rocket Pool network contract
    function getContractAddress(string memory _contractName) private view returns (address) {
        address contractAddress = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", _contractName)));
        require(contractAddress != address(0x0), "Contract not found");
        return contractAddress;
    }

    /// @dev Get a revert message from delegatecall return data
    function getRevertMessage(bytes memory _returnData) private pure returns (string memory) {
        if (_returnData.length < 68) {
            return "Transaction reverted silently";
        }
        assembly {
            _returnData := add(_returnData, 0x04)
        }
        return abi.decode(_returnData, (string));
    }

    /// @dev Returns true if contract exists at _contractAddress (if called during that contract's construction it will return a false negative)
    function contractExists(address _contractAddress) private view returns (bool) {
        uint32 codeSize;
        assembly {
            codeSize := extcodesize(_contractAddress)
        }
        return codeSize > 0;
    }

}
