pragma solidity 0.4.24;


import "../../../RocketBase.sol";
import "../../../interface/utils/lists/AddressSetStorageInterface.sol";
import "../../../interface/utils/pubsub/SubscriberInterface.sol";


/// @title PubSub system event publisher
/// @author Jake Pospischil
contract Publisher is RocketBase {


    /*** Contracts **************/


    AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(0);


    /*** Modifiers **************/


    /// @dev Only allow access from Rocket Pool network contracts after deployment
    modifier onlyLatestRocketNetwork() {
        if (rocketStorage.getBool(keccak256(abi.encodePacked("contract.storage.initialised")))) {
            require(
                rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", msg.sender))) != 0x0 || // Rocket Pool network contract
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
    /// @dev Overloaded by _value parameter type
    /// @param _event The key of the event to publish
    /*
    function publish(bytes32 _event) external onlyLatestRocketNetwork() {

    }
    */
    function publish(bytes32 _event, address _value) external onlyLatestRocketNetwork() {
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        uint256 count = addressSetStorage.getCount(keccak256(abi.encodePacked("publisher.event", _event)));
        for (uint256 i = 0; i < count; ++i) {
            SubscriberInterface subscriber = SubscriberInterface(addressSetStorage.getItem(keccak256(abi.encodePacked("publisher.event", _event)), i));
            subscriber.notify(_event, _value);
        }
    }
    /*
    function publish(bytes32 _event, bool _value) external onlyLatestRocketNetwork() {

    }
    function publish(bytes32 _event, bytes32 _value) external onlyLatestRocketNetwork() {

    }
    function publish(bytes32 _event, bytes _value) external onlyLatestRocketNetwork() {

    }
    function publish(bytes32 _event, int _value) external onlyLatestRocketNetwork() {

    }
    function publish(bytes32 _event, string _value) external onlyLatestRocketNetwork() {

    }
    function publish(bytes32 _event, uint _value) external onlyLatestRocketNetwork() {

    }
    */


    /// @dev Add a subscriber to an event
    /// @param _event The key of the event to subscribe to
    /// @param _subscriber The address of the subscriber to add
    function addSubscriber(bytes32 _event, address _subscriber) external onlyLatestRocketNetwork() {
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        addressSetStorage.addItem(keccak256(abi.encodePacked("publisher.event", _event)), _subscriber);
    }


    /// @dev Remove a subscriber from an event
    /// @param _event The key of the event to unsubscribe from
    /// @param _subscriber The address of the subscriber to remove
    function removeSubscriber(bytes32 _event, address _subscriber) external onlyLatestRocketNetwork() {
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        addressSetStorage.removeItem(keccak256(abi.encodePacked("publisher.event", _event)), _subscriber);
    }


}
