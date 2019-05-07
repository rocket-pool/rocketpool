pragma solidity 0.5.8;


import "../../../RocketBase.sol";
import "../../../interface/utils/lists/StringSetStorageInterface.sol";


/// @title PubSub system event publisher
/// @author Jake Pospischil
contract Publisher is RocketBase {


    /*** Contracts **************/


    StringSetStorageInterface stringSetStorage = StringSetStorageInterface(0);


    /*** Modifiers **************/


    /// @dev Only allow access from Rocket Pool network contracts after deployment
    modifier onlyLatestRocketNetwork() {
        if (rocketStorage.getBool(keccak256(abi.encodePacked("contract.storage.initialised")))) {
            require(
                rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", msg.sender))) != address(0x0) || // Rocket Pool network contract
                rocketStorage.getBool(keccak256(abi.encodePacked("minipool.exists", msg.sender))) // Minipool contract
            );
        }
        _;
    }


    /*** Methods ****************/


    /// @dev Publisher constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }


    /// @dev Publish event
    /// @param _event The key of the event to publish
    /// @param _payload The ABI encoded subscriber method call payload
    function publish(bytes32 _event, bytes memory _payload) public onlyLatestRocketNetwork() {
        stringSetStorage = StringSetStorageInterface(getContractAddress("utilStringSetStorage"));
        uint256 count = stringSetStorage.getCount(keccak256(abi.encodePacked("publisher.event", _event)));
        for (uint256 i = 0; i < count; ++i) {
            (bool success,) = getContractAddress(stringSetStorage.getItem(keccak256(abi.encodePacked("publisher.event", _event)), i)).call(_payload);
            require(success, "Subscriber call failed.");
        }
    }


    /// @dev Add a subscriber to an event
    /// @param _event The key of the event to subscribe to
    /// @param _subscriber The name of the subscriber to add
    function addSubscriber(bytes32 _event, string memory _subscriber) public onlyLatestRocketNetwork() {
        stringSetStorage = StringSetStorageInterface(getContractAddress("utilStringSetStorage"));
        stringSetStorage.addItem(keccak256(abi.encodePacked("publisher.event", _event)), _subscriber);
    }


    /// @dev Remove a subscriber from an event
    /// @param _event The key of the event to unsubscribe from
    /// @param _subscriber The name of the subscriber to remove
    function removeSubscriber(bytes32 _event, string memory _subscriber) public onlyLatestRocketNetwork() {
        stringSetStorage = StringSetStorageInterface(getContractAddress("utilStringSetStorage"));
        stringSetStorage.removeItem(keccak256(abi.encodePacked("publisher.event", _event)), _subscriber);
    }


}
