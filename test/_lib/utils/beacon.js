const ssz = require('@chainsafe/ssz');
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


// Create a random validator pubkey
export function getValidatorPubkey() {
    let index = ++defaultPubkeyIndex;
    return Buffer.from(index.toString(16).padStart(96, '0'), 'hex');
}


// Get the Rocket Pool withdrawal credentials
export function getWithdrawalCredentials() {
    let withdrawalPubkey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    return Buffer.concat([
        Buffer.from('00', 'hex'), // BLS_WITHDRAWAL_PREFIX_BYTE
        Buffer.from(web3.utils.sha3(Buffer.from(withdrawalPubkey, 'hex')).substr(2), 'hex').slice(1) // Last 31 bytes of withdrawal pubkey hash
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
    return ssz.hashTreeRoot(depositData, {fields: [
        ['pubkey', 'bytes48'],
        ['withdrawal_credentials', 'bytes32'],
        ['amount', 'uint64'],
        ['signature', 'bytes96'],
    ]});
}

