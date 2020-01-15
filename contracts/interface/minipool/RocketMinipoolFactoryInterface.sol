pragma solidity 0.5.8;


contract RocketMinipoolFactoryInterface {
    function createRocketMinipool(address _nodeOwner, string memory _durationID, bytes memory _validatorPubkey, bytes memory _validatorSignature, bytes memory _validatorDepositDataRoot, uint256 _etherDeposited, uint256 _rplDeposited, bool _trusted) public returns(address);
}