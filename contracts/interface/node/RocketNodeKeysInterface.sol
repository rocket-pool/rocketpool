pragma solidity 0.5.8;

contract RocketNodeKeysInterface {
    function validatePubkey(bytes memory _validatorPubkey) public view;
    function reservePubkey(address _nodeOwner, bytes memory _validatorPubkey, bool _reserve) public;
}
