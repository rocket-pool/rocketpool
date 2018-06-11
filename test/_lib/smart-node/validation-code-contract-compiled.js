const FS = require('fs');

/**
 * sendDeployValidationContract
 * 
 * Constructs and sends a transaction to deploy the Casper signature verification contract.
 * The contract is a pure function that uses the ecrecover precompiled contract for calculating the addressed used to sign a message.
 * The signer's address is baked into the contract at time of deployment.
 * The contract does not adhere to the ABI it is purely a function that is expecting parameters (hash, v, r, s)
 * The sendDeployValidationContract expects the signer address to be unlocked. 
*/

const $Web3 = require('web3');
const $web3 = new $Web3('http://localhost:8545');

module.exports = {
    sendDeployValidationContract
}

function sendDeployValidationContract(signerAddress){

    return $web3.eth.sendTransaction({
        from: signerAddress,
        data: _createValidationCodeContractBytes(signerAddress),
        gas: 2000000
    });

}
    
 // construct validation code contract
function _createValidationCodeContractBytes(signerAddress){
    // Remove the 0x identifier on the address
    signerAddress = signerAddress.substr(0, 2) == '0x' ? signerAddress.slice(2) : signerAddress;
    // Get the bytecode
    let casperBytecode = FS.readFileSync(__dirname + '/../../../contracts/contract/casper/compiled/validation_code_simple.bin');
    // Replace our placeholder address with the signer
    return casperBytecode.toString().replace(/00000000000000000000000000000PLACEHOLDER/gi, signerAddress.toLowerCase()).trim();
}
