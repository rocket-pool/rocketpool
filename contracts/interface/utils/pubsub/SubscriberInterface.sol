pragma solidity 0.5.0;

contract SubscriberInterface {
    function notify(bytes32 _event, bytes memory _data) public;
}
