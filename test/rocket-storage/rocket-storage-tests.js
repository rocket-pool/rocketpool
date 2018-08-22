import { printTitle, assertThrows } from '../_lib/utils/general';
import { scenarioWriteBool } from './rocket-storage-scenarios';
import { scenarioPushListItem } from './rocket-list-storage-scenarios';

export default function({owner}) {

    contract('RocketStorage', async (accounts) => {


        // Owners direct access to storage is removed after initialisation when deployed
        it(printTitle('owner', 'fail to access storage directly after deployment'), async () => {
            await assertThrows(scenarioWriteBool({
                key: web3.sha3('test.access'),
                value: true,
                fromAddress: owner,
                gas: 250000,
            }));
        });


    });

    contract('RocketListStorage', async (accounts) => {


        // Owner can push an item onto a list
        it(printTitle('owner', 'can push and item onto a list'), async () => {
            await scenarioPushListItem({
                type: 'Address',
                key: web3.sha3('test.addresses'),
                value: '0x0000000000000000000000000000000000000001',
                fromAddress: owner,
                gas: 500000,
            });
        });


    });

};
