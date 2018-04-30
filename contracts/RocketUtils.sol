pragma solidity 0.4.19;

import "./RocketBase.sol";
import "./interface/RocketStorageInterface.sol";

/// @title Utility methods for Rocket Pool
/// @author David Rugendyke
contract RocketUtils is RocketBase {

 
    /*** Constructor **********/
   
    /// @dev constructor
    function RocketUtils(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Set the version
        version = 1;
    }

   
    /*** Signature Utilities */

    /**
    * @dev Get the address that signed this message
    * @param _msgHash bytes32 message, the hash is the signed message. What is recovered is the signer address.
    * @param _sig bytes signature, the signature is generated using web3.eth.sign()
    * @return address
    */
    function sigVerifyRecoverAddr(bytes32 _msgHash, bytes _sig) public pure returns (address) {
        return sigRecover(_msgHash, _sig);
    }
    
    /**
    * @dev Verify the address supplied signed this message
    * @param _address The address to verify that signed the message
    * @param _msgHash bytes32 message, the hash is the signed message. What is recovered is the signer address.
    * @param _sig bytes signature, the signature is generated using web3.eth.sign()
    * @return bool
    */
    function sigVerifyIsSigned(address _address, bytes32 _msgHash, bytes _sig) public pure returns (bool) {
        return sigRecover(_msgHash, _sig) == _address;
    }

    /**
    * @dev Splits an ec signature into its component parts v, r, s
    * @param _sig Signature bytes to split
     */
    function sigSplit(bytes _sig) public pure returns (uint8, bytes32, bytes32) {
        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(_sig, 32))
            s := mload(add(_sig, 64))
            v := byte(0, mload(add(_sig, 96)))
        }

        // Version of signature should be 27 or 28, but 0 and 1 are also possible versions
        if (v < 27) {
            v += 27;
        }

        return (v, r, s);
    }

    /**
   * @dev Recover signer address from a message by using his signature (borrowed from Zepplin)
   * @param _msgHash bytes32 message, the hash is the signed message. What is recovered is the signer address.
   * @param _sig bytes signature, the signature is generated using web3.eth.sign()
   */
  function sigRecover(bytes32 _msgHash, bytes _sig) private pure returns (address) {

        bytes32 r;
        bytes32 s;
        uint8 v;

        //Check the signature length
        if (_sig.length != 65) {
            return (address(0));
        }

        // Divide the signature in r, s and v variables
        (v, r, s) = sigSplit(_sig);

        // If the version is correct return the signer address
        if (v != 27 && v != 28) {
            return (address(0));
        } else {
            return ecrecover(_msgHash, v, r, s);
        }

    }
   
}
