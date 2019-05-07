pragma solidity 0.5.8;


import "../../../RocketBase.sol";
import "../../../interface/settings/RocketNodeSettingsInterface.sol";
import "../../../interface/utils/lists/AddressQueueStorageInterface.sol";
import "../../../interface/utils/pubsub/PublisherInterface.sol";
import "../../../lib/SafeMath.sol";


/// @title DisableInactiveNodes - disables nodes that have not checked in recently
/// @author Jake Pospischil

contract DisableInactiveNodes is RocketBase {


    /*** Libs  ******************/


    using SafeMath for uint;


    /*** Contracts **************/


    RocketNodeSettingsInterface rocketNodeSettings = RocketNodeSettingsInterface(0);
    AddressQueueStorageInterface addressQueueStorage = AddressQueueStorageInterface(0);
    PublisherInterface publisher = PublisherInterface(0);


    /*** Methods ****************/


    /// @dev Constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }


    /// @dev Task name
    function name() public pure returns (string memory) { return "DisableInactiveNodes"; }


    /// @dev Run task
    function run(address _nodeAddress) public onlyLatestContract("rocketNodeTasks", msg.sender) returns (bool) {
        // Get contracts
        rocketNodeSettings = RocketNodeSettingsInterface(getContractAddress("rocketNodeSettings"));
        addressQueueStorage = AddressQueueStorageInterface(getContractAddress("utilAddressQueueStorage"));
        // Check automatic inactive node checks are enabled
        if (!rocketNodeSettings.getInactiveAutomatic()) { return true; }
        // Get settings
        uint256 inactiveDuration = rocketNodeSettings.getInactiveDuration();
        // Get number of node checks to perform
        uint256 nodeChecks = rocketNodeSettings.getMaxInactiveNodeChecks();
        uint256 checkinQueueLength = addressQueueStorage.getQueueLength(keccak256(abi.encodePacked("nodes.checkin.queue")));
        if (nodeChecks > checkinQueueLength) { nodeChecks = checkinQueueLength; }
        // Perform node checks
        address node;
        for (uint256 i = 0; i < nodeChecks; ++i) {
            // Get node address
            node = addressQueueStorage.getQueueItem(keccak256(abi.encodePacked("nodes.checkin.queue")), 0);
            // The current node does not need to be checked
            if (node == _nodeAddress) { continue; }
            // Disable node if it hasn't checked in during the last inactive duration
            if (rocketStorage.getUint(keccak256(abi.encodePacked("node.lastCheckin", node))) < now.sub(inactiveDuration)) {
                // Set node inactive
                rocketStorage.setBool(keccak256(abi.encodePacked("node.active", node)), false);
                // Publish node active status event
                publisher = PublisherInterface(getContractAddress("utilPublisher"));
                publisher.publish(keccak256("node.active.change"), abi.encodeWithSignature("onNodeActiveChange(address,bool)", node, false));
            }
            // Move node to end of checkin queue
            addressQueueStorage.dequeueItem(keccak256(abi.encodePacked("nodes.checkin.queue")));
            addressQueueStorage.enqueueItem(keccak256(abi.encodePacked("nodes.checkin.queue")), node);
        }
        // Done
        return true;
    }


}
