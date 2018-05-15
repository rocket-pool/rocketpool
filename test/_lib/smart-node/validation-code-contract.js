let _ = require('underscore')._;
let assemblyToEVM = require('../utils/assembly-to-evm');

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
    let addressBytes = $web3.utils.hexToBytes(signerAddress);

    // inject signer address into contract template
    let contractTemplate = _getContractTemplate();
    let contractAssembly = _replacePlaceholder(contractTemplate, '<PLACEHOLDER>', [`PUSH${addressBytes.length}`, ...addressBytes]);

    // convert from assembly to evm bytes
    return $web3.utils.bytesToHex(assemblyToEVM(contractAssembly))
}

// contract assembly template with <PLACEHOLDER for injecting the signer address
// https://github.com/karlfloersch/pyethereum/blob/develop/ethereum/hybrid_casper/casper_utils.py#L53-L66
function _getContractTemplate(){
    return [
            '_sym_6', 
            'JUMP', 
            '_sym_5', 
            'BLANK', 
            [
                'PUSH1', 128, 
                'PUSH1', 0, 
                'PUSH1', 0, 
                'CALLDATACOPY', 
                'PUSH1', 32, 
                'PUSH1', 0, 
                'PUSH1', 128, 
                'PUSH1', 0, 
                'PUSH1', 0, 
                'PUSH1', 1, 
                'PUSH2', 11, 184, 
                'CALL', 
                'POP', 
                '<PLACEHOLDER>', 
                'PUSH1', 0, 
                'MLOAD', 
                'EQ', 
                'PUSH1', 0, 
                'MSTORE', 
                'PUSH1', 32, 
                'PUSH1', 0, 
                'RETURN'
            ], 
            '_sym_6', 
            'JUMPDEST', 
            '_sym_5', 
            '_sym_6', 
            'SUB', 
            '_sym_5', 
            'PUSH1', 0, 
            'CODECOPY', 
            '_sym_5', 
            '_sym_6', 
            'SUB', 
            'PUSH1', 0, 
            'RETURN'
        ];
}
    
// replace a placeholder within an array of arrays
function _replacePlaceholder(list, placeholder, replacement){
    let newList = []
    list.forEach(item => {
        if(_.isArray(item)){
            newList.push(_replacePlaceholder(item, placeholder, replacement));
        }
        else if(item === placeholder){
            if (_.isArray(replacement)){
                newList = newList.concat(replacement);
            }
            else {
                newList.push(replacement);
            }
        }
        else {
            newList.push(item);
        }
    });
    return newList;
}