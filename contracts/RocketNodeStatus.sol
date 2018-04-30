pragma solidity 0.4.19;


import "./RocketNodeBase.sol";
import "./interface/RocketSettingsInterface.sol";
import "./interface/RocketPoolInterface.sol";


/// @title The RocketNodeStatus contract for checkin functionality.
/// @author Rocket Pool
contract RocketNodeStatus is RocketNodeBase {

    RocketSettingsInterface rocketSettings = RocketSettingsInterface(0);    // The main settings contract most global parameters are maintained 

    event NodeCheckin (
        address indexed _nodeAddress,
        uint256 loadAverage,
        uint256 created
    );

    event NodeActiveStatus (
        address indexed _nodeAddress,
        bool indexed _active,
        uint256 created
    );

    /// @dev rocket node validator constructor
    function RocketNodeStatus(address _rocketStorageAddress) RocketNodeBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }

    /// @dev Nodes will checkin with Rocket Pool at a set interval (15 mins) to do things like report on average node server load, set nodes to inactive that have not checked in an unusally long amount of time etc. Only registered nodes can call this.
    /// @param _currentLoadAverage The average server load for the node over the last 15 mins
    function nodeCheckin(uint256 _currentLoadAverage) public onlyRegisteredNode(msg.sender) {
        // Get the hub
        RocketPoolInterface rocketPool = RocketPoolInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketPool")));
        // Get our settings
        rocketSettings = RocketSettingsInterface(rocketStorage.getAddress(keccak256("contract.name", "rocketSettings")));
        // Fire the event
        NodeCheckin(msg.sender, _currentLoadAverage, now);
        // Updates the current 15 min load average on the node, last checkin time etc
        // Get the last checkin and only update if its changed to save on gas
        if (rocketStorage.getUint(keccak256("node.averageLoad", msg.sender)) != _currentLoadAverage) {
            rocketStorage.setUint(keccak256("node.averageLoad", msg.sender), _currentLoadAverage);
        }
        // Update the current checkin time
        rocketStorage.setUint(keccak256("node.lastCheckin", msg.sender), now);
        // Now check with the main Rocket Pool contract what pool actions currently need to be done
        // This method is designed to only process one minipool from each node checkin every 15 mins to prevent the gas block limit from being exceeded and make load balancing more accurate
        // 1) Assign a node to a new minipool that can be launched
        // 2) Request deposit withdrawal from Casper for any minipools currently staking
        // 3) Actually withdraw the deposit from Casper once it's ready for withdrawal
        rocketPool.poolNodeActions();  
        // Now see what nodes haven't checked in recently and disable them if needed to prevent new pools being assigned to them
        if (rocketSettings.getSmartNodeSetInactiveAutomatic() == true) {
            // Create an array at the length of the current nodes, then populate it
            address[] memory nodes = new address[](getNodeCount());
            // Get each node now and check
            for (uint32 i = 0; i < nodes.length; i++) {
                // Get our node address
                address currentNodeAddress = rocketStorage.getAddress(keccak256("nodes.index.reverse", i));
                // We've already checked in as this node above
                if (msg.sender != currentNodeAddress) {
                    // Has this node reported in recently? If not, it may be down or in trouble, deactivate it to prevent new pools being assigned to it
                    if (rocketStorage.getUint(keccak256("node.lastCheckin", currentNodeAddress)) < (now - rocketSettings.getSmartNodeSetInactiveDuration()) && rocketStorage.getBool(keccak256("node.active", currentNodeAddress)) == true) {
                        // Disable the node - must be manually reactivated by the function above when its back online/running well
                        rocketStorage.setBool(keccak256("node.active", currentNodeAddress), false);
                        // Fire the event
                        NodeActiveStatus(currentNodeAddress, false, now);
                    }
                }
            }
        } 
    }

}