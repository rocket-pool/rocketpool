import { printTitle } from '../utils';
import { scenarioIncrementEpoch, scenarioIncrementDynasty } from './casper-scenarios';

// UPDATE: The first version of Casper wont use the validation code, just the address of the validator, will keep this in for now in case it changes in the future
// Bytes - Set the node validation code (EVM bytecode, serving as a sort of public key that will be used to verify blocks and other consensus messages signed by it - just an example below)
// (converted to Bytes32 until Solidity allows passing of variable length types (bytes, string) between contracts - https://github.com/ethereum/EIPs/pull/211 )
// const nodeFirstValidationCode = web3.sha3('PUSH1 0 CALLDATALOAD SLOAD NOT PUSH1 9 JUMPI STOP JUMPDEST PUSH1 32 CALLDATALOAD PUSH1 0 CALLDATALOAD SSTORE');
// Bytes32 - Node value provided for the casper deposit function should be the result of computing a long chain of hashes (TODO: this will need work in the future when its defined better)
// const nodeFirstRandao = '0x9c22ff5f21f0b81b113e63f7db6da94fedef11b2119b4088b89664fb9a3cb658';

export default function({owner}) {

    contract('Casper', async (accounts) => {


        // Simulate Caspers epoch and dynasty changing
        it(printTitle('casper', 'simulate Caspers epoch and dynasty changing'), async () => {
            await scenarioIncrementEpoch(owner);
            await scenarioIncrementEpoch(owner);
            await scenarioIncrementDynasty(owner);
        });


    });

}
