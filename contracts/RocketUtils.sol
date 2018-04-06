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


    function assertValidationContractIsValid(address _val_code_address, address _node_address, bytes32 _sigHash, bytes _sig) public returns (bool) {
            
            var (v, r, s) = sigSplit(_sig); 

            bytes32 result;
            // bytes32 combinedHash = keccak256("\x19Ethereum Signed Message:\n32", _sigHash);
            bytes32 combinedHash = _sigHash;

            assembly {
                let x := mload(0x40)   //Find empty storage location using "free memory pointer"
                mstore(x, combinedHash) // Hash is first parameter 
                mstore(add(x,0x20),v) //Place first argument directly next to signature
                mstore(add(x,0x40),r) //Place second argument next to first, padded to 32 bytes
                mstore(add(x,0x60),s) //Place second argument next to first, padded to 32 bytes

                let success := call(      //This is the critical change (Pop the top stack value)
                                    5000, //5k gas
                                    _val_code_address, //To addr
                                    0,    //No value
                                    x,    //Inputs are stored at location x
                                    0x80, //Inputs are 80 bytes long (32 * 4)
                                    x,    //Store output over input (saves space)
                                    0x20) //Outputs are 32 bytes long

                result := mload(x) //Assign output value to c
                mstore(0x40,add(x,0x80)) // Set storage pointer to empty space
            }

            require(result == 0x1);
            return true;
    }


   
}
