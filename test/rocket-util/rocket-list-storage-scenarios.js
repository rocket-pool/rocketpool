// Dependencies
import { TestLists } from '../_lib/artifacts';


// Retrieve a list from storage
async function getList(prefix, key) {
    const testLists = await TestLists.deployed();

    // Get list count
    let count = await testLists[`${prefix}_getListCount`].call(key);

    // Get list items
    let items = [], item, index;
    for (index = 0; index < count; ++index) {
        item = await testLists[`${prefix}_getListItem`].call(key, index);
        if (item.constructor.name == 'BN') item = parseInt(item);
        items.push(item);
    }

    // Return list
    return items;

}


// Push an item into a list
export async function scenarioPushListItem({prefix, key, value, fromAddress, gas}) {
    const testLists = await TestLists.deployed();

    // Get initial list
    let list1 = await getList(prefix, key);

    // Push list item
    await testLists[`${prefix}_pushListItem`](key, value, {from: fromAddress, gas: gas});

    // Get updated list
    let list2 = await getList(prefix, key);

    // Asserts
    assert.equal(list2.length, list1.length + 1, 'List count was not updated correctly');
    assert.equal(list2[list2.length - 1], value, 'Value was not inserted correctly');
    list1.forEach((item, listIndex) => {
        assert.equal(list1[listIndex], list2[listIndex], 'List items changed which should not have');
    });

}


// Set a list item
export async function scenarioSetListItem({prefix, key, index, value, fromAddress, gas}) {
    const testLists = await TestLists.deployed();

    // Get initial list
    let list1 = await getList(prefix, key);

    // Set list item
    await testLists[`${prefix}_setListItem`](key, index, value, {from: fromAddress, gas: gas});

    // Get updated list
    let list2 = await getList(prefix, key);

    // Asserts
    assert.equal(list2.length, list1.length, 'List count was updated incorrectly');
    assert.equal(list2[index], value, 'Value was not set correctly');
    assert.notEqual(list2[index], list1[index], 'Value was not updated');
    list1.forEach((item, listIndex) => {
        if (listIndex != index) assert.equal(list1[listIndex], list2[listIndex], 'List items changed which should not have');
    });

}


// Insert an item into a list
export async function scenarioInsertListItem({prefix, key, index, value, fromAddress, gas}) {
    const testLists = await TestLists.deployed();

    // Get initial list
    let list1 = await getList(prefix, key);

    // Insert list item
    await testLists[`${prefix}_insertListItem`](key, index, value, {from: fromAddress, gas: gas});

    // Get updated list
    let list2 = await getList(prefix, key);

    // Asserts
    assert.equal(list2.length, list1.length + 1, 'List count was not updated correctly');
    assert.equal(list2[index], value, 'Value was not inserted correctly');
    list1.forEach((item, listIndex) => {
        if (listIndex < index) assert.equal(list1[listIndex], list2[listIndex], 'List items changed which should not have');
        else assert.equal(list1[listIndex], list2[listIndex + 1], 'List item was not moved successfully');
    });

}


// Remove an item from an ordered list
export async function scenarioRemoveOListItem({prefix, key, index, fromAddress, gas}) {
    const testLists = await TestLists.deployed();

    // Get initial list
    let list1 = await getList(prefix, key);

    // Insert list item
    await testLists[`${prefix}_removeOrderedListItem`](key, index, {from: fromAddress, gas: gas});

    // Get updated list
    let list2 = await getList(prefix, key);

    // Asserts
    assert.equal(list2.length, list1.length - 1, 'List count was not updated correctly');
    list2.forEach((item, listIndex) => {
        if (listIndex < index) assert.equal(list1[listIndex], list2[listIndex], 'List items changed which should not have');
        else assert.equal(list1[listIndex + 1], list2[listIndex], 'List item was not moved successfully');
    });

}


// Remove an item from an unordered list
export async function scenarioRemoveUListItem({prefix, key, index, fromAddress, gas}) {
    const testLists = await TestLists.deployed();

    // Get initial list
    let list1 = await getList(prefix, key);

    // Insert list item
    await testLists[`${prefix}_removeUnorderedListItem`](key, index, {from: fromAddress, gas: gas});

    // Get updated list
    let list2 = await getList(prefix, key);

    // Asserts
    assert.equal(list2.length, list1.length - 1, 'List count was not updated correctly');
    list2.forEach((item, listIndex) => {
        if (listIndex == index) assert.equal(list2[listIndex], list1[list1.length - 1], 'Last item was not moved correctly');
        else assert.equal(list1[listIndex], list2[listIndex], 'List items changed which should not have');
    });

}

