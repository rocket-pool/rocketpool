const SSZ = require('ssz');
import { printTitle, assertThrows } from '../_lib/utils/general';
import { BLSNew } from '../_lib/utils/bls';
import { CasperInstance } from '../_lib/utils/casper';
import { scenarioValidatorDeposit } from './casper-deposit-scenarios';

export default function() {

    contract.only('Casper Deposit', async (accounts) => {

        // Accounts
        const user = accounts[3];
              
        // Setup
        let casperDeposit;

        // Current Casper Deposit Settings
        const minDeposit = web3.utils.toWei('1', 'ether');
        const maxDeposit = web3.utils.toWei('32', 'ether');

         
        before(async () => {

            // Get contracts
            casperDeposit = await CasperInstance();

        });


        // Cannot deposit less than the min allowed
        it(printTitle('staker', 'can deposit via group depositor'), async () => {

            // Create a BLS key pair for the user
            let userBLS = await BLSNew();
            let userBLSPubkey = userBLS.getPublicKey().serializeToHexStr();
      
            /* Deposit input currently spec'd as
            {
                # BLS pubkey
                'pubkey': 'uint384',
                # Withdrawal credentials
                'withdrawal_credentials': 'hash32',
                # Initial RANDAO commitment
                'randao_commitment': 'hash32',
                # Initial custody commitment
                'custody_commitment': 'hash32',
                # A BLS signature of this `DepositInput`
                'proof_of_possession': ['uint384'],
            }
            */

            // Setup our deposit input as SSZ
            let depositInput = SSZ.serialize(
                {
                    // BLS pubkey
                    'pubkey': userBLSPubkey,
                    // Withdrawal credentials - TODO: This will need to be hashed and updated - https://github.com/ethereum/eth2.0-specs/blob/master/specs/core/0_beacon-chain.md#withdrawal-credentials
                    //'withdrawal_credentials': web3.utils.keccak256(0x00+userBLSPubkey),

                }, 
                'object'
            );

            console.log('HASH');
            console.log(depositInput);

            // Attempt deposit
            await assertThrows(scenarioValidatorDeposit(depositInput), 'Deposited less than the minimum for Casper.');
        

        });

    });


}
