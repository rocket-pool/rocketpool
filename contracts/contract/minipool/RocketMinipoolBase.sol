// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.7.6;

import "./RocketMinipoolStorageLayout.sol";
import "../../interface/RocketStorageInterface.sol";
import "../../interface/minipool/RocketMinipoolBaseInterface.sol";

/// @notice Contains the initialisation and delegate upgrade logic for minipools
contract RocketMinipoolBase is RocketMinipoolBaseInterface, RocketMinipoolStorageLayout {

    // Events
    event EtherReceived(address indexed from, uint256 amount, uint256 time);
    event DelegateUpgraded(address oldDelegate, address newDelegate, uint256 time);
    event DelegateRolledBack(address oldDelegate, address newDelegate, uint256 time);

    // Store a reference to the address of RocketMinipoolBase itself to prevent direct calls to this contract
    address immutable self;

    constructor () {
        self = address(this);
    }

    /// @dev Prevent direct calls to this contract
    modifier notSelf() {
        require(address(this) != self);
        _;
    }

    /// @dev Only allow access from the owning node address
    modifier onlyMinipoolOwner() {
        // Only the node operator can upgrade
        address withdrawalAddress = rocketStorage.getNodeWithdrawalAddress(nodeAddress);
        require(msg.sender == nodeAddress || msg.sender == withdrawalAddress, "Only the node operator can access this method");
        _;
    }

    /// @notice Sets up starting delegate contract and then delegates initialisation to it
    function initialise(address _rocketStorage, address _nodeAddress) external override notSelf {
        // Check input
        require(_nodeAddress != address(0), "Invalid node address");
        require(storageState == StorageState.Undefined, "Already initialised");
        // Set storage state to uninitialised
        storageState = StorageState.Uninitialised;
        // Set rocketStorage
        rocketStorage = RocketStorageInterface(_rocketStorage);
        // Set the current delegate
        address delegateAddress = getContractAddress("rocketMinipoolDelegate");
        rocketMinipoolDelegate = delegateAddress;
        // Check for contract existence
        require(contractExists(delegateAddress), "Delegate contract does not exist");
        // Call initialise on delegate
        (bool success, bytes memory data) = delegateAddress.delegatecall(abi.encodeWithSignature('initialise(address)', _nodeAddress));
        if (!success) { revert(getRevertMessage(data)); }
    }

    /// @notice Receive an ETH deposit
    receive() external payable notSelf {
        // Emit ether received event
        emit EtherReceived(msg.sender, msg.value, block.timestamp);
    }

    /// @notice Upgrade this minipool to the latest network delegate contract
    function delegateUpgrade() external override onlyMinipoolOwner notSelf {
        // Set previous address
        rocketMinipoolDelegatePrev = rocketMinipoolDelegate;
        // Set new delegate
        rocketMinipoolDelegate = getContractAddress("rocketMinipoolDelegate");
        // Verify
        require(rocketMinipoolDelegate != rocketMinipoolDelegatePrev, "New delegate is the same as the existing one");
        // Log event
        emit DelegateUpgraded(rocketMinipoolDelegatePrev, rocketMinipoolDelegate, block.timestamp);
    }

    /// @notice Rollback to previous delegate contract
    function delegateRollback() external override onlyMinipoolOwner notSelf {
        // Make sure they have upgraded before
        require(rocketMinipoolDelegatePrev != address(0x0), "Previous delegate contract is not set");
        // Store original
        address originalDelegate = rocketMinipoolDelegate;
        // Update delegate to previous and zero out previous
        rocketMinipoolDelegate = rocketMinipoolDelegatePrev;
        rocketMinipoolDelegatePrev = address(0x0);
        // Log event
        emit DelegateRolledBack(originalDelegate, rocketMinipoolDelegate, block.timestamp);
    }

    /// @notice Sets the flag to automatically use the latest delegate contract or not
    /// @param _setting If true, will always use the latest delegate contract
    function setUseLatestDelegate(bool _setting) external override onlyMinipoolOwner notSelf {
        useLatestDelegate = _setting;
    }

    /// @notice Returns true if this minipool always uses the latest delegate contract
    function getUseLatestDelegate() external override view returns (bool) {
        return useLatestDelegate;
    }

    /// @notice Returns the address of the minipool's stored delegate
    function getDelegate() external override view returns (address) {
        return rocketMinipoolDelegate;
    }

    /// @notice Returns the address of the minipool's previous delegate (or address(0) if not set)
    function getPreviousDelegate() external override view returns (address) {
        return rocketMinipoolDelegatePrev;
    }

    /// @notice Returns the delegate which will be used when calling this minipool taking into account useLatestDelegate setting
    function getEffectiveDelegate() external override view returns (address) {
        return useLatestDelegate ? getContractAddress("rocketMinipoolDelegate") : rocketMinipoolDelegate;
    }

    /// @notice Delegates all calls to minipool delegate contract (or latest if flag is set)
    fallback(bytes calldata _input) external payable notSelf returns (bytes memory) {
        // If useLatestDelegate is set, use the latest delegate contract
        address delegateContract = useLatestDelegate ? getContractAddress("rocketMinipoolDelegate") : rocketMinipoolDelegate;
        // Check for contract existence
        require(contractExists(delegateContract), "Delegate contract does not exist");
        // Execute delegatecall
        (bool success, bytes memory data) = delegateContract.delegatecall(_input);
        if (!success) { revert(getRevertMessage(data)); }
        return data;
    }

    /// @dev Get the address of a Rocket Pool network contract
    function getContractAddress(string memory _contractName) private view returns (address) {
        address contractAddress = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", _contractName)));
        require(contractAddress != address(0x0), "Contract not found");
        return contractAddress;
    }

    /// @dev Get a revert message from delegatecall return data
    function getRevertMessage(bytes memory _returnData) private pure returns (string memory) {
        if (_returnData.length < 68) { return "Transaction reverted silently"; }
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
