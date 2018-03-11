pragma solidity 0.4.19;


contract RocketUtilsInterface {
     /**
    * @dev Get the address that signed this message
    * @param _msgHash bytes32 message, the hash is the signed message. What is recovered is the signer address.
    * @param _sig bytes signature, the signature is generated using web3.eth.sign()
    * @return address
    */
    function sigVerifyRecoverAddr(bytes32 _msgHash, bytes _sig) public pure returns (address);
    /**
    * @dev Verify the address supplied signed this message
    * @param _address The address to verify that signed the message
    * @param _msgHash bytes32 message, the hash is the signed message. What is recovered is the signer address.
    * @param _sig bytes signature, the signature is generated using web3.eth.sign()
    * @return bool
    */
    function sigVerifyIsSigned(address _address, bytes32 _msgHash, bytes _sig) public pure returns (bool);
}