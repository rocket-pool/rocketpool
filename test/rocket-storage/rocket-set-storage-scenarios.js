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
    

}

