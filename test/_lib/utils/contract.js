// Dependencies
const pako = require('pako');

// Compress / decompress ABIs for storage
export function compressAbi(abi) {
    return Buffer.from(pako.deflate(JSON.stringify(abi))).toString('base64');
}
export function decompressAbi(abi) {
    return JSON.parse(pako.inflate(Buffer.from(abi, 'base64'), {to: 'string'}));
}
