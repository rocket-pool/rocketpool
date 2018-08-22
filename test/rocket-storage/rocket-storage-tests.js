import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketListStorage } from '../_lib/artifacts'
import { scenarioWriteBool } from './rocket-storage-scenarios';
import { scenarioPushListItem, scenarioSetListItem, scenarioInsertListItem, scenarioRemoveOListItem, scenarioRemoveUListItem } from './rocket-list-storage-scenarios';

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


        // Contract dependencies
        let rocketListStorage;
        before(async () => {
            rocketListStorage = await RocketListStorage.deployed();
        });


        // Run list tests by type
        function listTests(type, key, testValues) {


            // Push an item onto a list
            it(printTitle(type, 'push an item onto a list'), async () => {

                // Push items
                await scenarioPushListItem({
                    type: type,
                    key: key,
                    value: testValues[0],
                    fromAddress: owner,
                    gas: 500000,
                });
                await scenarioPushListItem({
                    type: type,
                    key: key,
                    value: testValues[1],
                    fromAddress: owner,
                    gas: 500000,
                });
                await scenarioPushListItem({
                    type: type,
                    key: key,
                    value: testValues[2],
                    fromAddress: owner,
                    gas: 500000,
                });

            });


            // Set a list item at index
            it(printTitle(type, 'set a list item at index'), async () => {

                // Set item
                await scenarioSetListItem({
                    type: type,
                    key: key,
                    index: 1,
                    value: testValues[3],
                    fromAddress: owner,
                    gas: 500000,
                });

                // Set item at out of bounds index
                await assertThrows(scenarioSetListItem({
                    type: type,
                    key: key,
                    index: 99,
                    value: testValues[6],
                    fromAddress: owner,
                    gas: 500000,
                }), 'Set a list item with an out of bounds index');

            });


            // Insert an item into a list at index
            it(printTitle(type, 'insert an item into a list at index'), async () => {

                // Insert item
                await scenarioInsertListItem({
                    type: type,
                    key: key,
                    index: 1,
                    value: testValues[4],
                    fromAddress: owner,
                    gas: 500000,
                });

                // Insert item at end of list
                let count = await rocketListStorage[`get${type}ListCount`].call(key);
                await scenarioInsertListItem({
                    type: type,
                    key: key,
                    index: count,
                    value: testValues[5],
                    fromAddress: owner,
                    gas: 500000,
                });

                // Insert item at out of bounds index
                await assertThrows(scenarioInsertListItem({
                    type: type,
                    key: key,
                    index: 99,
                    value: testValues[6],
                    fromAddress: owner,
                    gas: 500000,
                }), 'Inserted a list item with an out of bounds index');

            });


            // Remove an item from an ordered list at index
            it(printTitle(type, 'remove an item from an ordered list at index'), async () => {

                // Remove item
                await scenarioRemoveOListItem({
                    type: type,
                    key: key,
                    index: 2,
                    fromAddress: owner,
                    gas: 500000,
                });

                // Remove item at out of bounds index
                await assertThrows(scenarioRemoveOListItem({
                    type: type,
                    key: key,
                    index: 99,
                    fromAddress: owner,
                    gas: 500000,
                }), 'Removed a list item with an out of bounds index');

            });


            // Remove an item from an unordered list at index
            it(printTitle(type, 'remove an item from an unordered list at index'), async () => {

                // Remove item
                await scenarioRemoveUListItem({
                    type: type,
                    key: key,
                    index: 1,
                    fromAddress: owner,
                    gas: 500000,
                });

                // Remove item at end of list
                let count = await rocketListStorage[`get${type}ListCount`].call(key);
                await scenarioRemoveUListItem({
                    type: type,
                    key: key,
                    index: count - 1,
                    fromAddress: owner,
                    gas: 500000,
                });

                // Remove an item at out of bounds index
                await assertThrows(scenarioRemoveUListItem({
                    type: type,
                    key: key,
                    index: 99,
                    fromAddress: owner,
                    gas: 500000,
                }), 'Removed a list item with an out of bounds index');

            });


        }


        // Run list tests
        listTests('Address', web3.sha3('test.addresses'), [
            '0x0000000000000000000000000000000000000001',
            '0x0000000000000000000000000000000000000002',
            '0x0000000000000000000000000000000000000003',
            '0x0000000000000000000000000000000000000004',
            '0x0000000000000000000000000000000000000005',
            '0x0000000000000000000000000000000000000006',
            '0x0000000000000000000000000000000000000099',
        ]);


    });

};
