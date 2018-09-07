// Retrieve a queue from storage
async function getQueue(contract, key) {

    // Get queue length
    let length = await contract.getQueueLength.call(key);

    // Get queue items
    let items = [], item, index;
    for (index = 0; index < length; ++index) {
        item = await contract.getQueueItem.call(key, index);
        if (item.constructor.name == 'BN') item = parseInt(item);
        items.push(item);
    }

    // Return queue
    return items;

}


// Enqueue an item
export async function scenarioEnqueueItem({contract, key, value, fromAddress, gas}) {

    // Get initial queue
    let queue1 = await getQueue(contract, key);

    // Enqueue item
    await contract.enqueueItem(key, value, {from: fromAddress, gas: gas});

    // Get updated queue
    let queue2 = await getQueue(contract, key);

    // Asserts
    assert.equal(queue2.length, queue1.length + 1, 'Queue length was not updated correctly');
    assert.equal(queue2[queue2.length - 1], value, 'Value was not enqueued correctly');
    queue1.forEach((item, queueIndex) => {
        assert.equal(queue1[queueIndex], queue2[queueIndex], 'Queue items changed which should not have');
    });

}


// Dequeue an item
export async function scenarioDequeueItem({contract, key, fromAddress, gas}) {

    // Get initial queue
    let queue1 = await getQueue(contract, key);

    // Dequeue item
    await contract.dequeueItem(key, {from: fromAddress, gas: gas});

    // Get updated queue
    let queue2 = await getQueue(contract, key);

    // Asserts
    assert.equal(queue2.length, queue1.length - 1, 'Queue length was not updated correctly');
    queue2.forEach((item, queueIndex) => {
        assert.equal(queue1[queueIndex + 1], queue2[queueIndex], 'Queue item was not moved successfully');
    });

}

