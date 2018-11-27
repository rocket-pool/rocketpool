pragma solidity 0.5.0;

contract PublisherInterface {
    function publish(bytes32 _event, bytes memory _data) public;
    function addSubscriber(bytes32 _event, string memory _subscriber) public;
    function removeSubscriber(bytes32 _event, string memory _subscriber) public;
}
