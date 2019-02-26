const ssz = require('@chainsafesystems/ssz');
const WebSocket = require('ws');


// Default beacon chain simulator api host
const beaconHost = 'http://127.0.0.1:9545';


// Current default pubkey index
let defaultPubkeyIndex = 0;


// Get the status of a validator on the beacon chain
export async function getValidatorStatus(pubkey) {

    // Validator status promise
    let validatorStatus = new Promise((resolve, reject) => {

        // Initialise websocket connection to beacon chain simulator api
        let ws = new WebSocket(beaconHost);

        // Request validator status on connection open
        ws.on('open', () => {
            ws.send(JSON.stringify({
                message: 'get_validator_status',
                pubkey,
            }));
        });

        // Handle server messages
        ws.on('message', (payload) => {
            try {
                let data = JSON.parse(payload);
                switch (data.message) {

                    // Validator status
                    case 'validator_status':
                        if (data.pubkey != pubkey) break;
                        ws.close();
                        resolve(data.status);
                    break;

                    // Error
                    case 'error':
                        ws.close();
                        reject(new Error(data.error));
                    break;

                }
            }
            catch (e) {
                ws.close();
                reject(new Error(e.message));
            }
        });

    });

    // Return status
    let status = await validatorStatus;
    return status;

}


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
        Buffer.from(web3.utils.sha3(Buffer.from(withdrawalPubkey, 'hex')).substr(2), 'hex').slice(1) // Last 31 bytes of withdrawal pubkey hash
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


// Deserialise a serialised DepositInput object
export function deserialiseDepositInput(depositInputHex) {

    // Deserialise
    let depositInputData = ssz.deserialize(Buffer.from(depositInputHex.substr(2), 'hex'), {fields: [
        ['pubkey', 'bytes48'],
        ['withdrawal_credentials', 'bytes32'],
        ['proof_of_possession', 'bytes96'],
    ]});

    // Return DepositInput object
    return {
        pubkey: depositInputData.deserializedData.pubkey.toString('hex'),
        withdrawal_credentials: depositInputData.deserializedData.withdrawal_credentials.toString('hex'),
        proof_of_possession: depositInputData.deserializedData.proof_of_possession.toString('hex'),
    };

}

