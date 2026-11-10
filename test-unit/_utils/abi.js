const pako = require('pako');

// Compress / decompress contract ABIs
export function compressABI(abi) {
    return Buffer.from(pako.deflate(JSON.stringify(abi))).toString('base64');
}
export function decompressABI(abi) {
    return JSON.parse(pako.inflate(Buffer.from(abi, 'base64'), {to: 'string'}));
}

