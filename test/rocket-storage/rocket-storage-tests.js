import { printTitle, assertThrows } from '../_lib/utils/general';
import { AddressListStorage, BoolListStorage, BytesListStorage, IntListStorage, StringListStorage, UintListStorage } from '../_lib/artifacts';
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


    // Run list tests by type
    function listTests(name, contractArtifact, key, testValues, indexOfTests = true) {
        contract(name, async (accounts) => {


            // Contract dependencies
            let contract;
            before(async () => {
                contract = await contractArtifact.deployed();
            });


            // Push an item onto a list
            it(printTitle('-----', 'push an item onto a list'), async () => {

                // Push items
                await scenarioPushListItem({
                    contract,
                    key,
                    value: testValues[0],
                    fromAddress: owner,
                    gas: 500000,
                });
                await scenarioPushListItem({
                    contract,
                    key,
                    value: testValues[1],
                    fromAddress: owner,
                    gas: 500000,
                });
                await scenarioPushListItem({
                    contract,
                    key,
                    value: testValues[2],
                    fromAddress: owner,
                    gas: 500000,
                });

                // Test indexOf
                if (indexOfTests) {
                    let index1 = await contract.getListIndexOf(key, testValues[2]);
                    let index2 = await contract.getListIndexOf(key, testValues[6]);
                    assert.equal(index1.valueOf(), 2, 'getListIndexOf returned incorrect index');
                    assert.equal(index2.valueOf(), -1, 'getListIndexOf returned index when value did not exist');
                }

            });


            // Set a list item at index
            it(printTitle('-----', 'set a list item at index'), async () => {

                // Set item
                await scenarioSetListItem({
                    contract,
                    key,
                    index: 1,
                    value: testValues[3],
                    fromAddress: owner,
                    gas: 500000,
                });

                // Set item at out of bounds index
                await assertThrows(scenarioSetListItem({
                    contract,
                    key,
                    index: 99,
                    value: testValues[6],
                    fromAddress: owner,
                    gas: 500000,
                }), 'Set a list item with an out of bounds index');

            });


            // Insert an item into a list at index
            it(printTitle('-----', 'insert an item into a list at index'), async () => {

                // Insert item
                await scenarioInsertListItem({
                    contract,
                    key,
                    index: 1,
                    value: testValues[4],
                    fromAddress: owner,
                    gas: 500000,
                });

                // Insert item at end of list
                let count = await contract.getListCount.call(key);
                await scenarioInsertListItem({
                    contract,
                    key,
                    index: count,
                    value: testValues[5],
                    fromAddress: owner,
                    gas: 500000,
                });

                // Insert item at out of bounds index
                await assertThrows(scenarioInsertListItem({
                    contract,
                    key,
                    index: 99,
                    value: testValues[6],
                    fromAddress: owner,
                    gas: 500000,
                }), 'Inserted a list item with an out of bounds index');

            });


            // Remove an item from an ordered list at index
            it(printTitle('-----', 'remove an item from an ordered list at index'), async () => {

                // Remove item
                await scenarioRemoveOListItem({
                    contract,
                    key,
                    index: 2,
                    fromAddress: owner,
                    gas: 500000,
                });

                // Remove item at out of bounds index
                await assertThrows(scenarioRemoveOListItem({
                    contract,
                    key,
                    index: 99,
                    fromAddress: owner,
                    gas: 500000,
                }), 'Removed a list item with an out of bounds index');

            });


            // Remove an item from an unordered list at index
            it(printTitle('-----', 'remove an item from an unordered list at index'), async () => {

                // Remove item
                await scenarioRemoveUListItem({
                    contract,
                    key,
                    index: 1,
                    fromAddress: owner,
                    gas: 500000,
                });

                // Remove item at end of list
                let count = await contract.getListCount.call(key);
                await scenarioRemoveUListItem({
                    contract,
                    key,
                    index: count - 1,
                    fromAddress: owner,
                    gas: 500000,
                });

                // Remove an item at out of bounds index
                await assertThrows(scenarioRemoveUListItem({
                    contract,
                    key,
                    index: 99,
                    fromAddress: owner,
                    gas: 500000,
                }), 'Removed a list item with an out of bounds index');

            });


        });
    }


    /*
    // Run list tests
    listTests('AddressListStorage', AddressListStorage, web3.sha3('test.addresses'), [
        '0x0000000000000000000000000000000000000001',
        '0x0000000000000000000000000000000000000002',
        '0x0000000000000000000000000000000000000003',
        '0x0000000000000000000000000000000000000004',
        '0x0000000000000000000000000000000000000005',
        '0x0000000000000000000000000000000000000006',
        '0x0000000000000000000000000000000000000099',
    ]);
    listTests('BoolListStorage', BoolListStorage, web3.sha3('test.bools'), [
        true,
        false,
        true,
        true,
        true,
        false,
        true,
    ], false);
    listTests('BytesListStorage', BytesListStorage, web3.sha3('test.bytes'), [
        web3.sha3('test string 1'),
        web3.sha3('test string 2'),
        web3.sha3('test string 3'),
        web3.sha3('test string 4'),
        web3.sha3('test string 5'),
        web3.sha3('test string 6'),
        web3.sha3('test string 99'),
    ]);
    listTests('IntListStorage', IntListStorage, web3.sha3('test.ints'), [
        -1,
        2,
        -3,
        4,
        -5,
        6,
        -99,
    ]);
    listTests('StringListStorage', StringListStorage, web3.sha3('test.strings'), [
        'test string 1',
        'test string 2',
        'test string 3',
        'test string 4',
        'test string 5',
        'test string 6',
        'test string 99',
    ]);
    listTests('UintListStorage', UintListStorage, web3.sha3('test.uints'), [
        1,
        2,
        3,
        4,
        5,
        6,
        99,
    ]);
    */


};
