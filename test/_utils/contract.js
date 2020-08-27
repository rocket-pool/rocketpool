// Dependencies
const pako = require('pako');


// Get arbitrary contract events from a transaction result
// txReceipt is the receipt returned from the transaction call
// contractAddress is the address of the contract to retrieve events for
// eventName is the name of the event to retrieve
// eventParams is an array of objects with string 'type' and 'name' keys and an optional boolean 'indexed' key
export function getTxContractEvents(txReceipt, contractAddress, eventName, eventParams) {
    return txReceipt.receipt.rawLogs
        .filter(log => (log.address.toLowerCase() == contractAddress.toLowerCase()))
        .filter(log => (log.topics[0] == web3.utils.soliditySha3(eventName + '(' + eventParams.map(param => param.type).join(',') + ')')))
        .map(log => web3.eth.abi.decodeLog(eventParams.map(param => {
            let decodeParam = Object.assign({}, param);
            if (decodeParam.indexed && (decodeParam.type == 'string' || decodeParam.type == 'bytes')) decodeParam.type = 'bytes32'; // Issues decoding indexed string and bytes parameters
            return decodeParam;
        }), log.data, log.topics.slice(1)));
}


// Compress / decompress contract ABIs
export function compressABI(abi) {
    return Buffer.from(pako.deflate(JSON.stringify(abi))).toString('base64');
}
export function decompressABI(abi) {
    return JSON.parse(pako.inflate(Buffer.from(abi, 'base64'), {to: 'string'}));
}

