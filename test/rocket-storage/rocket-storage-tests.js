import { printTitle, assertThrows } from '../_lib/utils/general';
import { scenarioWriteBool } from './rocket-storage-scenarios';
import { scenarioPushListItem, scenarioSetListItem } from './rocket-list-storage-scenarios';

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


        // Push an item onto a list
        it(printTitle('-----', 'push an item onto a list'), async () => {
            await scenarioPushListItem({
                type: 'Address',
                key: web3.sha3('test.addresses'),
                value: '0x0000000000000000000000000000000000000001',
                fromAddress: owner,
                gas: 500000,
            });
            await scenarioPushListItem({
                type: 'Address',
                key: web3.sha3('test.addresses'),
                value: '0x0000000000000000000000000000000000000002',
                fromAddress: owner,
                gas: 500000,
            });
            await scenarioPushListItem({
                type: 'Address',
                key: web3.sha3('test.addresses'),
                value: '0x0000000000000000000000000000000000000003',
                fromAddress: owner,
                gas: 500000,
            });
        });


        // Set a list item by index
        it(printTitle('-----', 'set a list item by index'), async () => {
            await scenarioSetListItem({
                type: 'Address',
                key: web3.sha3('test.addresses'),
                index: 1,
                value: '0x0000000000000000000000000000000000000004',
                fromAddress: owner,
                gas: 500000,
            });
            await assertThrows(scenarioSetListItem({
                type: 'Address',
                key: web3.sha3('test.addresses'),
                index: 9,
                value: '0x0000000000000000000000000000000000000005',
                fromAddress: owner,
                gas: 500000,
            }), 'Set a list item with an out of bounds index');
        });


    });

};
