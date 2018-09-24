// Dependencies
import { TestSets } from '../_lib/artifacts';


// Retrieve a set from storage
async function getSet(prefix, key) {
    const testSets = await TestSets.deployed();

    // Get set count
    let count = await testSets[`${prefix}_getCount`].call(key);

    // Get set items
    let items = [], item, index;
    for (index = 0; index < count; ++index) {
        item = await testSets[`${prefix}_getItem`].call(key, index);
        if (item.constructor.name == 'BN') item = parseInt(item);
        items.push(item);
    }

    // Return set
    return items;

}


// Add an item
export async function scenarioAddItem({prefix, key, value, fromAddress, gas}) {
    const testSets = await TestSets.deployed();

    // Get initial set
    let set1 = await getSet(prefix, key);

    // Add item
    await testSets[`${prefix}_addItem`](key, value, {from: fromAddress, gas: gas});

    // Get updated set
    let set2 = await getSet(prefix, key);

    // Asserts
    assert.equal(set2.length, set1.length + 1, 'Set count was not updated correctly');
    assert.equal(set2[set2.length - 1], value, 'Value was not added correctly');
    set1.forEach((item, index) => {
        assert.equal(set1[index], set2[index], 'Set items changed which should not have');
    });

}


// Remove an item
export async function scenarioRemoveItem({prefix, key, value, fromAddress, gas}) {
    const testSets = await TestSets.deployed();

    // Get initial set
    let set1 = await getSet(prefix, key);

    // Remove item
    await testSets[`${prefix}_removeItem`](key, value, {from: fromAddress, gas: gas});

    // Get updated set
    let set2 = await getSet(prefix, key);

    // Asserts
    assert.equal(set2.length, set1.length - 1, 'Set count was not updated correctly');
    assert.equal(set2.indexOf(value), -1, 'Value was not removed correctly');
    set1.forEach((item, index) => {
        if (item == value) return;
        assert.notEqual(set2.indexOf(item), -1, 'Set items were removed and should not have been');
    });

}

