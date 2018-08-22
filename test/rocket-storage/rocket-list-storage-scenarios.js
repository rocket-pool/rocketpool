import { RocketListStorage } from '../_lib/artifacts';


// Retrieve a list from storage
async function getList(type, key) {
    const rocketListStorage = await RocketListStorage.deployed();

    // Get list count
    let count = await rocketListStorage[`get${type}ListCount`].call(key);

    // Get list items
    let items = [], index;
    for (index = 0; index < count; ++index) {
        items.push(await rocketListStorage[`get${type}ListItem`].call(key, index));
    }

    // Return list
    return items;

}


// Push an item into a list
export async function scenarioPushListItem({type, key, value, fromAddress, gas}) {
    const rocketListStorage = await RocketListStorage.deployed();

    // Get initial list
    let list1 = await getList(type, key);

    // Push list item
    await rocketListStorage[`push${type}ListItem`](key, value, {from: fromAddress, gas: gas});

    // Get updated list
    let list2 = await getList(type, key);

    // Asserts
    assert.equal(list2.length, list1.length + 1, 'List count was not updated correctly');
    assert.equal(list2[list2.length - 1], value, 'Value was not inserted correctly');
    list1.forEach((item, listIndex) => {
        assert.equal(list1[listIndex], list2[listIndex], 'List items changed which should not have');
    });

}


// Set a list item
export async function scenarioSetListItem({type, key, index, value, fromAddress, gas}) {
    const rocketListStorage = await RocketListStorage.deployed();

    // Get initial list
    let list1 = await getList(type, key);

    // Set list item
    await rocketListStorage[`set${type}ListItem`](key, index, value, {from: fromAddress, gas: gas});

    // Get updated list
    let list2 = await getList(type, key);

    // Asserts
    assert.equal(list2.length, list1.length, 'List count was updated incorrectly');
    assert.equal(list2[index], value, 'Value was not set correctly');
    assert.notEqual(list2[index], list1[index], 'Value was not updated');
    list1.forEach((item, listIndex) => {
        if (listIndex != index) assert.equal(list1[listIndex], list2[listIndex], 'List items changed which should not have');
    });

}


// Insert an item into a list
export async function scenarioInsertListItem({type, key, index, value, fromAddress, gas}) {
    const rocketListStorage = await RocketListStorage.deployed();

    // Get initial list
    let list1 = await getList(type, key);

    // Insert list item
    await rocketListStorage[`insert${type}ListItem`](key, index, value, {from: fromAddress, gas: gas});

    // Get updated list
    let list2 = await getList(type, key);

    // Asserts
    assert.equal(list2.length, list1.length + 1, 'List count was not updated correctly');
    assert.equal(list2[index], value, 'Value was not inserted correctly');
    list1.forEach((item, listIndex) => {
        if (listIndex < index) assert.equal(list1[listIndex], list2[listIndex], 'List items changed which should not have');
        else assert.equal(list1[listIndex], list2[listIndex + 1], 'List item was not moved successfully');
    });

}


// Remove an item from an ordered list
export async function scenarioRemoveOListItem({type, key, index, fromAddress, gas}) {
    const rocketListStorage = await RocketListStorage.deployed();

    // Get initial list
    let list1 = await getList(type, key);

    // Insert list item
    await rocketListStorage[`removeO${type}ListItem`](key, index, {from: fromAddress, gas: gas});

    // Get updated list
    let list2 = await getList(type, key);

    // Asserts
    assert.equal(list2.length, list1.length - 1, 'List count was not updated correctly');
    list1.forEach((item, listIndex) => {
        if (listIndex < index) assert.equal(list1[listIndex], list2[listIndex], 'List items changed which should not have');
        else assert.equal(list1[listIndex + 1], list2[listIndex], 'List item was not moved successfully');
    });

}


// Remove an item from an unordered list
export async function scenarioRemoveUListItem({type, key, index, fromAddress, gas}) {
    const rocketListStorage = await RocketListStorage.deployed();

    // Get initial list
    let list1 = await getList(type, key);

    // Insert list item
    await rocketListStorage[`removeU${type}ListItem`](key, index, {from: fromAddress, gas: gas});

    // Get updated list
    let list2 = await getList(type, key);

    // Asserts
    assert.equal(list2.length, list1.length - 1, 'List count was not updated correctly');
    list2.forEach((item, listIndex) => {
        if (listIndex == index) assert.equal(list2[listIndex], list1[list1.length - 1], 'Last item was not moved correctly');
        else assert.equal(list1[listIndex], list2[listIndex], 'List items changed which should not have');
    });

}

