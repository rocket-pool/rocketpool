pragma solidity 0.4.24;

contract PublisherInterface {
    function publish(bytes32 _event, address _value1, uint8 _value2) external;
    function publish(bytes32 _event, string _value1, uint256 _value2) external;
    function addSubscriber(bytes32 _event, string _subscriber) external;
    function removeSubscriber(bytes32 _event, string _subscriber) external;
}
