pragma solidity 0.4.24;

contract SubscriberInterface {
    function notify(bytes32 _event, address _value1, uint8 _value2) external;
    function notify(bytes32 _event, string _value1, uint256 _value2) external;
}
