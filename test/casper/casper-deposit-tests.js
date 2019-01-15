const crypto = require('crypto');
const SSZ = require('ssz');
import { printTitle, assertThrows, repeatHash } from '../_lib/utils/general';
import { BLSNew } from '../_lib/utils/bls';
import { scenarioValidatorDeposit } from './casper-deposit-scenarios';

export default function() {

    contract.only('Casper Deposit', async (accounts) => {


        // Accounts
        const user1 = accounts[1];


        // Current Casper deposit settings
        const minDeposit = web3.utils.toWei('1', 'ether');
        const maxDeposit = web3.utils.toWei('32', 'ether');


        // Cannot deposit less than the minimum deposit amount
        it(printTitle('validator', 'cannot deposit less than the minimum deposit amount into Casper'), async () => {

            // Create a BLS key pair for the validator
            let validatorPrivateKey = await BLSNew();
            let validatorPublicKey = Buffer.from(validatorPrivateKey.getPublicKey().serializeToHexStr(), 'hex');

            // Create a BLS key pair for withdrawal credentials
            let withdrawalPrivateKey = await BLSNew();
            let withdrawalPublicKey = Buffer.from(withdrawalPrivateKey.getPublicKey().serializeToHexStr(), 'hex');

            // Get compressed public keys
            // TODO: Correctly get compressed G1 points (x coordinates only; 48 bytes) - this solution is not valid
            let validatorPublicKeyCompressed = validatorPublicKey.slice(0, 48);
            let withdrawalPublicKeyCompressed = withdrawalPublicKey.slice(0, 48);

            // Get withdrawal credentials
            let withdrawalCredentials = Buffer.concat([
                Buffer.from('00', 'hex'), // BLS_WITHDRAWAL_PREFIX_BYTE
                Buffer.from(web3.utils.sha3(withdrawalPublicKeyCompressed).substr(2), 'hex').slice(1) // Last 31 bytes of withdrawal pubkey hash
            ], 32);

            // Generate randao commitment
            // TODO: repeatHash 100k+ times recommended
            let randaoSeed = crypto.randomBytes(32);
            let randaoCommitment = Buffer.from(repeatHash(randaoSeed, 5000).substr(2), 'hex');

            // Generate custody commitment
            // TODO: repeatHash 100k+ times recommended
            let custodySeed = crypto.randomBytes(32);
            let custodyCommitment = Buffer.from(repeatHash(custodySeed, 5000).substr(2), 'hex');

            // TODO: implement proof of possession once hash_tree_root functionality is available in SSZ

            // Setup our deposit input as SSZ
            let depositInput = SSZ.serialize(
                {
                    'pubkey': validatorPublicKeyCompressed,
                    'withdrawal_credentials': withdrawalCredentials,
                    'randao_commitment': randaoCommitment,
                    'custody_commitment': custodyCommitment,
                    //'proof_of_possession': null,
                },
                {fields: {
                    'pubkey': 'uint384',
                    'withdrawal_credentials': 'hash32',
                    'randao_commitment': 'hash32',
                    'custody_commitment': 'hash32',
                    //'proof_of_possession': ['uint384'],
                }}
            );

            // Attempt deposit
            await assertThrows(scenarioValidatorDeposit({
                depositInput,
                fromAddress: user1,
                value: web3.utils.toWei('0.5', 'ether'),
                gas: 5000000,
            }), 'Deposited less than the minimum deposit amount into Casper.');

        });


    });

}
