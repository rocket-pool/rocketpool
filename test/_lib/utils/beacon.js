const ssz = require('@chainsafesystems/ssz');


// Current default pubkey index
let defaultPubkeyIndex = 0;


// Create a serialised DepositInput object from a given set of credentials
export function getDepositInput({pubkey, withdrawalPubkey}) {

    // Create default pubkey
    if (!pubkey) {
        let index = ++defaultPubkeyIndex;
        pubkey = index.toString(16).padStart(96, '0');
    }

    // Default withdrawal pubkey
    if (!withdrawalPubkey) withdrawalPubkey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    // Get withdrawal credentials
    let withdrawalCredentials = Buffer.concat([
        Buffer.from('00', 'hex'), // BLS_WITHDRAWAL_PREFIX_BYTE
        Buffer.from(web3.utils.sha3(withdrawalPubkey).substr(2), 'hex').slice(1) // Last 31 bytes of withdrawal pubkey hash
    ], 32);

    // Get proof of possession
    // TODO: implement correctly once BLS library found
    let proofOfPossession = Buffer.from(
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' +
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' +
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        'hex'
    );

    // Return depositInput
    return ssz.serialize(
        {
            'pubkey': Buffer.from(pubkey, 'hex'),
            'withdrawal_credentials': withdrawalCredentials,
            'proof_of_possession': proofOfPossession,
        },
        {fields: [
            ['pubkey', 'bytes48'],
            ['withdrawal_credentials', 'bytes32'],
            ['proof_of_possession', 'bytes96'],
        ]}
    );

}
