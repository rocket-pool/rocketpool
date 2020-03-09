import { printTitle, assertThrows } from '../_lib/utils/general';
import { scenarioGetContractAddress, scenarioCreateMinipool, scenarioRemoveMinipool } from './rocket-pool-scenarios';

export default function() {

    contract('RocketPool', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const nodeOwner = accounts[1];


        // Cannot get a nonexistant contract address
        it(printTitle('-----', 'cannot get a nonexistant contract address'), async () => {
            await assertThrows(scenarioGetContractAddress('nonexistant'), 'Got a nonexistant contract address');
        });


        // Cannot create a minipool directly
        it(printTitle('-----', 'cannot create a minipool directly'), async () => {

            // Create minipool
            await assertThrows(scenarioCreateMinipool({
                nodeOwner: nodeOwner,
                durationID: '3m',
                etherAmount: web3.utils.toWei('1', 'ether'),
                rplAmount: web3.utils.toWei('1', 'ether'),
                isTrusted: false,
                fromAddress: owner,
            }), 'Created a minipool directly');

        });


        // Cannot remove a minipool directly
        it(printTitle('-----', 'cannot remove a minipool directly'), async () => {
            await assertThrows(scenarioRemoveMinipool({
                fromAddress: owner,
            }), 'Removed a minipool directly');
        });


    });

}

