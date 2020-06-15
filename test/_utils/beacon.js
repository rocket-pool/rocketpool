const ssz = require('@chainsafe/ssz');
const types = require('@chainsafe/lodestar-types/lib/ssz/presets/mainnet').types;


// Current pubkey index
let pubkeyIndex = 0;


// Create a new validator pubkey
export function getValidatorPubkey() {
    let index = ++pubkeyIndex;
    return Buffer.from(index.toString(16).padStart(96, '0'), 'hex');
}


// Create a validator signature
// TODO: implement correctly once BLS library found
export function getValidatorSignature() {
    return Buffer.from(
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' +
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' +
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    'hex');
}


// Create validator deposit data root
export function getDepositDataRoot(depositData) {
    return types.DepositData.hashTreeRoot(depositData);
}

