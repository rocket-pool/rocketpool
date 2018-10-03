// Dependencies
import { TestQueues } from '../_lib/artifacts';


// Retrieve a queue from storage
async function getQueue(prefix, key) {
    const testQueues = await TestQueues.deployed();

    // Get queue length
    let length = await testQueues[`${prefix}_getQueueLength`].call(key);

    // Get queue items
    let items = [], item, index;
    for (index = 0; index < length; ++index) {
        item = await testQueues[`${prefix}_getQueueItem`].call(key, index);
        if (item.constructor.name == 'BN') item = parseInt(item);
        items.push(item);
    }

    // Return queue
    return items;

}


// Enqueue an item
export async function scenarioEnqueueItem({prefix, key, value, fromAddress, gas}) {
    const testQueues = await TestQueues.deployed();

    // Get initial queue
    let queue1 = await getQueue(prefix, key);

    // Enqueue item
    await testQueues[`${prefix}_enqueueItem`](key, value, {from: fromAddress, gas: gas});

    // Get updated queue
    let queue2 = await getQueue(prefix, key);

    // Asserts
    assert.equal(queue2.length, queue1.length + 1, 'Queue length was not updated correctly');
    assert.equal(queue2[queue2.length - 1], value, 'Value was not enqueued correctly');
    queue1.forEach((item, queueIndex) => {
        assert.equal(queue1[queueIndex], queue2[queueIndex], 'Queue items changed which should not have');
    });

}


// Dequeue an item
export async function scenarioDequeueItem({prefix, key, fromAddress, gas}) {
    const testQueues = await TestQueues.deployed();

    // Get initial queue
    let queue1 = await getQueue(prefix, key);

    // Dequeue item
    await testQueues[`${prefix}_dequeueItem`](key, {from: fromAddress, gas: gas});

    // Get updated queue
    let queue2 = await getQueue(prefix, key);

    // Asserts
    assert.equal(queue2.length, queue1.length - 1, 'Queue length was not updated correctly');
    queue2.forEach((item, queueIndex) => {
        assert.equal(queue1[queueIndex + 1], queue2[queueIndex], 'Queue item was not moved successfully');
    });

}


// Remove an item
export async function scenarioRemoveQueueItem({prefix, key, value, fromAddress, gas}) {
    const testQueues = await TestQueues.deployed();

    // Get initial queue
    let queue1 = await getQueue(prefix, key);

    // Get item index
    let itemIndex = parseInt(await testQueues[`${prefix}_getQueueIndexOf`].call(key, value));

    // Remove item
    await testQueues[`${prefix}_removeItem`](key, value, {from: fromAddress, gas: gas});

    // Get updated queue
    let queue2 = await getQueue(prefix, key);

    // Asserts
    assert.equal(queue2.length, queue1.length - 1, 'Queue length was not updated correctly');
    queue2.forEach((item, queueIndex) => {
        if (queueIndex == itemIndex) assert.equal(queue2[queueIndex], queue1[queue1.length - 1], 'Last item was not moved correctly');
        else assert.equal(queue1[queueIndex], queue2[queueIndex], 'Queue items changed which should not have');
    });

}

