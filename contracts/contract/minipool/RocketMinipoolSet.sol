pragma solidity 0.5.8;


import "../../RocketBase.sol";
import "../../interface/RocketNodeInterface.sol";
import "../../interface/RocketPoolInterface.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../interface/utils/lists/AddressSetStorageInterface.sol";


/// @title RocketMinipoolSet - manages the active minipool set
/// @author Jake Pospischil

contract RocketMinipoolSet is RocketBase {


    /*** Contracts **************/


    RocketNodeInterface rocketNode = RocketNodeInterface(0);
    RocketPoolInterface rocketPool = RocketPoolInterface(0);
    RocketMinipoolInterface minipool = RocketMinipoolInterface(0);
    RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(0);
    AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(0);


    /*** Constructor *************/


    /// @dev RocketMinipoolSet constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }


    /*** Subscriptions ***********/


    /// @dev Minipool available status changed
    function onMinipoolAvailableChange(address _minipool, bool _available, address, bool, string memory _durationID) public onlyLatestContract("utilPublisher", msg.sender) {

        // Remove minipool from active set if unavailable
        if (!_available) { removeActiveMinipool(_durationID, _minipool); }

    }


    /*** Methods *************/


    // Get next minipool in the active set
    function getNextActiveMinipool(string memory _durationID, uint256 _seed) public onlyLatestContract("rocketDepositQueue", msg.sender) returns (address) {

        // Get contracts
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));

        // Get active minipool count
        uint256 activeMinipoolCount = addressSetStorage.getCount(keccak256(abi.encodePacked("minipools.active", _durationID)));

        // Create active minipool set if empty
        if (activeMinipoolCount == 0) { activeMinipoolCount = createActiveMinipoolSet(_durationID, _seed); }

        // Get & increment active minipool offset
        uint256 offset = rocketStorage.getUint(keccak256(abi.encodePacked("minipools.active.offset", _durationID))) % activeMinipoolCount;
        rocketStorage.setUint(keccak256(abi.encodePacked("minipools.active.offset", _durationID)), offset + 1);

        // Return active minipool
        return addressSetStorage.getItem(keccak256(abi.encodePacked("minipools.active", _durationID)), offset);

    }


    // Update all active minipools to ensure correct status
    function updateActiveMinipools(string memory _durationID) public onlyLatestContract("rocketDepositQueue", msg.sender) {

        // Get contracts
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));

        // Update active minipools
        uint256 activeMinipoolCount = addressSetStorage.getCount(keccak256(abi.encodePacked("minipools.active", _durationID)));
        for (uint256 mi = 0; mi < activeMinipoolCount; ++mi) {
            address minipoolAddress = addressSetStorage.getItem(keccak256(abi.encodePacked("minipools.active", _durationID)), mi);
            minipool = RocketMinipoolInterface(minipoolAddress);
            minipool.updateStatus();
        }

    }


    // Check if minipool is in active set and remove it
    function removeActiveMinipool(string memory _durationID, address _miniPoolAddress) private {
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        if (addressSetStorage.getIndexOf(keccak256(abi.encodePacked("minipools.active", _durationID)), _miniPoolAddress) != -1) {
            addressSetStorage.removeItem(keccak256(abi.encodePacked("minipools.active", _durationID)), _miniPoolAddress);
        }
    }


    // Create active minipool set
    // Returns active minipool set size
    function createActiveMinipoolSet(string memory _durationID, uint256 _seed) private returns (uint256) {

        // Get contracts
        rocketNode = RocketNodeInterface(getContractAddress("rocketNode"));
        rocketPool = RocketPoolInterface(getContractAddress("rocketPool"));
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));

        // Get settings
        uint256 activeSetSize = rocketMinipoolSettings.getMinipoolActiveSetSize();

        // Get node counts
        uint256 untrustedNodeCount = rocketNode.getAvailableNodeCount(false, _durationID);
        uint256 trustedNodeCount = rocketNode.getAvailableNodeCount(true, _durationID);

        // Get node type and number to add to active set
        bool trusted = false;
        uint256 nodeAddCount = untrustedNodeCount;
        if (untrustedNodeCount == 0) {
            trusted = true;
            nodeAddCount = trustedNodeCount;
        }
        if (nodeAddCount > activeSetSize) { nodeAddCount = activeSetSize; }

        // Add random node minipools to active set
        for (uint256 i = 0; i < nodeAddCount; ++i) {
            address miniPoolAddress = rocketPool.getRandomAvailableMinipool(trusted, _durationID, _seed, i);
            addressSetStorage.addItem(keccak256(abi.encodePacked("minipools.active", _durationID)), miniPoolAddress);
        }

        // Return active minipool set size
        return nodeAddCount;

    }


}
