pragma solidity 0.4.24;

contract SubscriberInterface {
    function notify(bytes32 _event) external;
    function notify(bytes32 _event, address _value) external;
    function notify(bytes32 _event, bool _value) external;
    function notify(bytes32 _event, bytes32 _value) external;
    function notify(bytes32 _event, bytes _value) external;
    function notify(bytes32 _event, int _value) external;
    function notify(bytes32 _event, string _value) external;
    function notify(bytes32 _event, uint _value) external;
}
