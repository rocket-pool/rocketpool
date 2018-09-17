import { printTitle, assertThrows } from '../_lib/utils/general';
import { TestLists, TestQueues } from '../_lib/artifacts';
import { scenarioWriteBool } from './rocket-storage-scenarios';
import { scenarioPushListItem, scenarioSetListItem, scenarioInsertListItem, scenarioRemoveOListItem, scenarioRemoveUListItem } from './rocket-list-storage-scenarios';
import { scenarioEnqueueItem, scenarioDequeueItem } from './rocket-queue-storage-scenarios';

export default function() {

    contract('RocketStorage', async (accounts) => {


        // Owners direct access to storage is removed after initialisation when deployed
        it(printTitle('owner', 'fail to access storage directly after deployment'), async () => {
            await assertThrows(scenarioWriteBool({
                key: web3.utils.soliditySha3('test.access'),
                value: true,
                fromAddress: accounts[0],
                gas: 250000,
            }));
        });


    });


    // Run list tests by type
    function listTests(name, prefix, key, testValues, indexOfTests = true) {
        contract(name, async (accounts) => {


            // Contract dependencies
            let testLists;
            before(async () => {
                testLists = await TestLists.deployed();
                testLists.init();
            });


            // Push an item onto a list
            it(printTitle('-----', 'push an item onto a list'), async () => {

                // Push items
                await scenarioPushListItem({
                    prefix,
                    key,
                    value: testValues[0],
                    fromAddress: accounts[0],
                    gas: 500000,
                });
                await scenarioPushListItem({
                    prefix,
                    key,
                    value: testValues[1],
                    fromAddress: accounts[0],
                    gas: 500000,
                });
                await scenarioPushListItem({
                    prefix,
                    key,
                    value: testValues[2],
                    fromAddress: accounts[0],
                    gas: 500000,
                });

                // Test indexOf
                if (indexOfTests) {
                    let index1 = await testLists[`${prefix}_getListIndexOf`].call(key, testValues[2]);
                    let index2 = await testLists[`${prefix}_getListIndexOf`].call(key, testValues[6]);
                    assert.equal(index1.valueOf(), 2, 'getListIndexOf returned incorrect index');
                    assert.equal(index2.valueOf(), -1, 'getListIndexOf returned index when value did not exist');
                }

            });


            // Set a list item at index
            it(printTitle('-----', 'set a list item at index'), async () => {

                // Set item
                await scenarioSetListItem({
                    prefix,
                    key,
                    index: 1,
                    value: testValues[3],
                    fromAddress: accounts[0],
                    gas: 500000,
                });

                // Set item at out of bounds index
                await assertThrows(scenarioSetListItem({
                    prefix,
                    key,
                    index: 99,
                    value: testValues[6],
                    fromAddress: accounts[0],
                    gas: 500000,
                }), 'Set a list item with an out of bounds index');

            });


            // Insert an item into a list at index
            it(printTitle('-----', 'insert an item into a list at index'), async () => {

                // Insert item
                await scenarioInsertListItem({
                    prefix,
                    key,
                    index: 1,
                    value: testValues[4],
                    fromAddress: accounts[0],
                    gas: 500000,
                });

                // Insert item at end of list
                let count = await testLists[`${prefix}_getListCount`].call(key);
                await scenarioInsertListItem({
                    prefix,
                    key,
                    index: count,
                    value: testValues[5],
                    fromAddress: accounts[0],
                    gas: 500000,
                });

                // Insert item at out of bounds index
                await assertThrows(scenarioInsertListItem({
                    prefix,
                    key,
                    index: 99,
                    value: testValues[6],
                    fromAddress: accounts[0],
                    gas: 500000,
                }), 'Inserted a list item with an out of bounds index');

            });


            // Remove an item from an ordered list at index
            it(printTitle('-----', 'remove an item from an ordered list at index'), async () => {

                // Remove item
                await scenarioRemoveOListItem({
                    prefix,
                    key,
                    index: 2,
                    fromAddress: accounts[0],
                    gas: 500000,
                });

                // Remove item at out of bounds index
                await assertThrows(scenarioRemoveOListItem({
                    prefix,
                    key,
                    index: 99,
                    fromAddress: accounts[0],
                    gas: 500000,
                }), 'Removed a list item with an out of bounds index');

            });


            // Remove an item from an unordered list at index
            it(printTitle('-----', 'remove an item from an unordered list at index'), async () => {

                // Remove item
                await scenarioRemoveUListItem({
                    prefix,
                    key,
                    index: 1,
                    fromAddress: accounts[0],
                    gas: 500000,
                });

                // Remove item at end of list
                let count = await testLists[`${prefix}_getListCount`].call(key);
                await scenarioRemoveUListItem({
                    prefix,
                    key,
                    index: count - 1,
                    fromAddress: accounts[0],
                    gas: 500000,
                });

                // Remove an item at out of bounds index
                await assertThrows(scenarioRemoveUListItem({
                    prefix,
                    key,
                    index: 99,
                    fromAddress: accounts[0],
                    gas: 500000,
                }), 'Removed a list item with an out of bounds index');

            });


        });
    }


    // Run queue tests by type
    function queueTests(name, prefix, key, testValues) {
        contract(name, async (accounts) => {


            // Contract dependencies
            let testQueues;
            before(async () => {
                testQueues = await TestQueues.deployed();
                testQueues.init();
            });


            // Perform multiple test runs to test queue wrapping
            for (let ri = 0; ri < 3; ++ri) {
                let runTestValues = testValues[ri];


                // Enqueue items
                it(printTitle('-----', 'enqueue items'), async () => {

                    // Check queue capacity
                    let capacity = parseInt(await testQueues[`${prefix}_capacity`].call()) - 1;
                    assert.isTrue(runTestValues.length > capacity, 'Pre-check failed - more queue capacity than test values'); // Set contract queue capacity to 4 for testing

                    // Enqueue until full
                    let i;
                    for (i = 0; i < capacity; ++i) {
                        await scenarioEnqueueItem({
                            prefix,
                            key,
                            value: runTestValues[i],
                            fromAddress: accounts[0],
                            gas: 500000,
                        });
                    }

                    // Attempt enqueue
                    await assertThrows(scenarioEnqueueItem({
                        prefix,
                        key,
                        value: runTestValues[i],
                        fromAddress: accounts[0],
                        gas: 500000,
                    }), 'Enqueued an item while queue is at capacity');

                });


                // Dequeue items
                it(printTitle('-----', 'dequeue items'), async () => {

                    // Get queue length
                    let length = parseInt(await testQueues[`${prefix}_getQueueLength`].call(key));

                    // Dequeue until empty
                    for (let i = 0; i < length; ++i) {
                        await scenarioDequeueItem({
                            prefix,
                            key,
                            fromAddress: accounts[0],
                            gas: 500000,
                        });
                    }

                    // Attempt dequeue
                    await assertThrows(scenarioDequeueItem({
                        prefix,
                        key,
                        fromAddress: accounts[0],
                        gas: 500000,
                    }), 'Dequeued an item while queue is empty');

                });

            }


        });
    }


    // Run list tests
    listTests('AddressListStorage', 'address', web3.utils.soliditySha3('list.addresses'), [
        '0x0000000000000000000000000000000000000001',
        '0x0000000000000000000000000000000000000002',
        '0x0000000000000000000000000000000000000003',
        '0x0000000000000000000000000000000000000004',
        '0x0000000000000000000000000000000000000005',
        '0x0000000000000000000000000000000000000006',
        '0x0000000000000000000000000000000000000099',
    ]);
    listTests('BoolListStorage', 'bool', web3.utils.soliditySha3('list.bools'), [
        true,
        false,
        true,
        true,
        true,
        false,
        true,
    ], false);
    listTests('BytesListStorage', 'bytes', web3.utils.soliditySha3('list.bytes'), [
        web3.utils.soliditySha3('test string 1'),
        web3.utils.soliditySha3('test string 2'),
        web3.utils.soliditySha3('test string 3'),
        web3.utils.soliditySha3('test string 4'),
        web3.utils.soliditySha3('test string 5'),
        web3.utils.soliditySha3('test string 6'),
        web3.utils.soliditySha3('test string 99'),
    ]);
    listTests('Bytes32ListStorage', 'bytes32', web3.utils.soliditySha3('list.bytes32'), [
        '0x0000000000000000000000000000000000000000000000000000000000000001',
        '0x0000000000000000000000000000000000000000000000000000000000000002',
        '0x0000000000000000000000000000000000000000000000000000000000000003',
        '0x0000000000000000000000000000000000000000000000000000000000000004',
        '0x0000000000000000000000000000000000000000000000000000000000000005',
        '0x0000000000000000000000000000000000000000000000000000000000000006',
        '0x0000000000000000000000000000000000000000000000000000000000000099',
    ]);
    listTests('IntListStorage', 'int', web3.utils.soliditySha3('list.ints'), [
        -1,
        2,
        -3,
        4,
        -5,
        6,
        -99,
    ]);
    listTests('StringListStorage', 'string', web3.utils.soliditySha3('list.strings'), [
        'test string 1',
        'test string 2',
        'test string 3',
        'test string 4',
        'test string 5',
        'test string 6',
        'test string 99',
    ]);
    listTests('UintListStorage', 'uint', web3.utils.soliditySha3('list.uints'), [
        1,
        2,
        3,
        4,
        5,
        6,
        99,
    ]);

    // Run queue tests
    queueTests('AddressQueueStorage', 'address', web3.utils.soliditySha3('queue.addresses'), [
        [
            '0x0000000000000000000000000000000000000001',
            '0x0000000000000000000000000000000000000002',
            '0x0000000000000000000000000000000000000003',
            '0x0000000000000000000000000000000000000004',
        ],
        [
            '0x0000000000000000000000000000000000000005',
            '0x0000000000000000000000000000000000000006',
            '0x0000000000000000000000000000000000000007',
            '0x0000000000000000000000000000000000000008',
        ],
        [
            '0x0000000000000000000000000000000000000009',
            '0x0000000000000000000000000000000000000010',
            '0x0000000000000000000000000000000000000011',
            '0x0000000000000000000000000000000000000012',
        ],
    ]);
    queueTests('BoolQueueStorage', 'bool', web3.utils.soliditySha3('queue.bools'), [
        [
            true,
            false,
            true,
            false,
        ],
        [
            true,
            false,
            true,
            false,
        ],
        [
            true,
            false,
            true,
            false,
        ],
    ]);
    queueTests('BytesQueueStorage', 'bytes', web3.utils.soliditySha3('queue.bytes'), [
        [
            web3.utils.soliditySha3('test string 1'),
            web3.utils.soliditySha3('test string 2'),
            web3.utils.soliditySha3('test string 3'),
            web3.utils.soliditySha3('test string 4'),
        ],
        [
            web3.utils.soliditySha3('test string 5'),
            web3.utils.soliditySha3('test string 6'),
            web3.utils.soliditySha3('test string 7'),
            web3.utils.soliditySha3('test string 8'),
        ],
        [
            web3.utils.soliditySha3('test string 9'),
            web3.utils.soliditySha3('test string 10'),
            web3.utils.soliditySha3('test string 11'),
            web3.utils.soliditySha3('test string 12'),
        ],
    ]);
    queueTests('Bytes32QueueStorage', 'bytes32', web3.utils.soliditySha3('queue.bytes32'), [
        [
            '0x0000000000000000000000000000000000000000000000000000000000000001',
            '0x0000000000000000000000000000000000000000000000000000000000000002',
            '0x0000000000000000000000000000000000000000000000000000000000000003',
            '0x0000000000000000000000000000000000000000000000000000000000000004',
        ],
        [
            '0x0000000000000000000000000000000000000000000000000000000000000005',
            '0x0000000000000000000000000000000000000000000000000000000000000006',
            '0x0000000000000000000000000000000000000000000000000000000000000007',
            '0x0000000000000000000000000000000000000000000000000000000000000008',
        ],
        [
            '0x0000000000000000000000000000000000000000000000000000000000000009',
            '0x0000000000000000000000000000000000000000000000000000000000000010',
            '0x0000000000000000000000000000000000000000000000000000000000000011',
            '0x0000000000000000000000000000000000000000000000000000000000000012',
        ],
    ]);
    queueTests('IntQueueStorage', 'int', web3.utils.soliditySha3('queue.ints'), [
        [
            -1,
            2,
            -3,
            4,
        ],
        [
            -5,
            6,
            -7,
            8,
        ],
        [
            -9,
            10,
            -11,
            12,
        ],
    ]);
    queueTests('StringQueueStorage', 'string', web3.utils.soliditySha3('queue.strings'), [
        [
            'test string 1',
            'test string 2',
            'test string 3',
            'test string 4',
        ],
        [
            'test string 5',
            'test string 6',
            'test string 7',
            'test string 8',
        ],
        [
            'test string 9',
            'test string 10',
            'test string 11',
            'test string 12',
        ],
    ]);
    queueTests('UintQueueStorage', 'uint', web3.utils.soliditySha3('queue.uints'), [
        [
            1,
            2,
            3,
            4,
        ],
        [
            5,
            6,
            7,
            8,
        ],
        [
            9,
            10,
            11,
            12,
        ],
    ]);


};
