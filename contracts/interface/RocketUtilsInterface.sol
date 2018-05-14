pragma solidity 0.4.23;


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
    /**
    * @dev Splits an ec signature into its component parts v, r, s
    * @param _sig Signature bytes to split
    */
    function sigSplit(bytes _sig) public pure returns (uint8, bytes32, bytes32);
}