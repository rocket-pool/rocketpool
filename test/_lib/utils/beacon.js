const ssz = require('@chainsafe/ssz');
const types = require('@chainsafe/lodestar-types/lib/ssz/presets/mainnet').types;


// Current default pubkey index
let defaultPubkeyIndex = 0;


// Create a random validator pubkey
export function getValidatorPubkey() {
    let index = ++defaultPubkeyIndex;
    return Buffer.from(index.toString(16).padStart(96, '0'), 'hex');
}


// Get the Rocket Pool withdrawal pubkey
export function getWithdrawalPubkey() {
    return Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');
}


// Get the Rocket Pool withdrawal credentials
export function getWithdrawalCredentials() {
    return Buffer.concat([
        Buffer.from('00', 'hex'), // BLS_WITHDRAWAL_PREFIX_BYTE
        Buffer.from(web3.utils.sha3(getWithdrawalPubkey()).substr(2), 'hex').slice(1) // Last 31 bytes of withdrawal pubkey hash
    ], 32);
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
export function getValidatorDepositDataRoot(depositData) {
    return types.DepositData.hashTreeRoot(depositData);
}

