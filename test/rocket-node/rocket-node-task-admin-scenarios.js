// Dependencies
import { RocketNodeTasks } from '../_lib/artifacts';


// Retrieve task address list from storage
async function getTaskAddresses() {
    const rocketNodeTasks = await RocketNodeTasks.deployed();

    // Get list count
    let count = await rocketNodeTasks.getTaskCount.call();

    // Get addresses
    let addresses = [], address, index;
    for (index = 0; index < count; ++index) {
        address = await rocketNodeTasks.getTaskAddressAt.call(index);
        addresses.push(address);
    }

    // Return addresses
    return addresses;

}


// Retrieve task name list from storage
async function getTaskNames() {
    const rocketNodeTasks = await RocketNodeTasks.deployed();

    // Get list count
    let count = await rocketNodeTasks.getTaskCount.call();

    // Get names
    let names = [], name, index;
    for (index = 0; index < count; ++index) {
        name = await rocketNodeTasks.getTaskNameAt.call(index);
        names.push(name);
    }

    // Return names
    return names;

}


// Add a node task
export async function scenarioAddNodeTask({taskAddress, taskName, fromAddress, gas}) {
    const rocketNodeTasks = await RocketNodeTasks.deployed();

    // Get initial task address & name list
    let taskAddresses1 = await getTaskAddresses();
    let taskNames1 = await getTaskNames();

    // Add task
    await rocketNodeTasks.add(taskAddress, {from: fromAddress, gas: gas});

    // Get updated task address & name list
    let taskAddresses2 = await getTaskAddresses();
    let taskNames2 = await getTaskNames();

    // Asserts
    assert.equal(taskAddresses2.length, taskAddresses1.length + 1, 'Task list count was not updated correctly');
    assert.notEqual(taskAddresses2.indexOf(taskAddress), -1, 'Task was not added correctly');
    assert.equal(taskAddresses2.indexOf(taskAddress), taskNames2.indexOf(taskName), 'Added task name is incorrect');
    taskAddresses1.forEach((address) => {
        assert.notEqual(taskAddresses2.indexOf(address), -1, 'Task was removed which should not have been');
    });

}


// Remove a node task
export async function scenarioRemoveNodeTask({taskAddress, fromAddress, gas}) {
    const rocketNodeTasks = await RocketNodeTasks.deployed();

    // Get initial task address list
    let taskAddresses1 = await getTaskAddresses();

    // Remove task
    await rocketNodeTasks.remove(taskAddress, {from: fromAddress, gas: gas});

    // Get updated task address list
    let taskAddresses2 = await getTaskAddresses();

    // Asserts
    assert.equal(taskAddresses2.length, taskAddresses1.length - 1, 'Task list count was not updated correctly');
    assert.equal(taskAddresses2.indexOf(taskAddress), -1, 'Task was not removed correctly');
    taskAddresses1.forEach((address) => {
        if (address == taskAddress) return;
        assert.notEqual(taskAddresses2.indexOf(address), -1, 'Task was removed which should not have been');
    });

}


// Update a node task
export async function scenarioUpdateNodeTask({oldAddress, newAddress, fromAddress, gas}) {
    const rocketNodeTasks = await RocketNodeTasks.deployed();

    // Get initial task address list
    let taskAddresses1 = await getTaskAddresses();

    // Get task index
    let taskIndex = taskAddresses1.map(address => address.toLowerCase()).indexOf(oldAddress.toLowerCase());

    // Update task
    await rocketNodeTasks.update(oldAddress, newAddress, {from: fromAddress, gas: gas});

    // Get updated task address list
    let taskAddresses2 = await getTaskAddresses();

    // Asserts
    assert.equal(taskAddresses2.length, taskAddresses1.length, 'Task list count changed and should not have');
    assert.equal(taskAddresses1[taskIndex], oldAddress, 'Old task address not found in initial list');
    assert.equal(taskAddresses2[taskIndex], newAddress, 'Task was not updated correctly');
    taskAddresses1.forEach((address, index) => {
        if (index == taskIndex) return;
        assert.equal(taskAddresses1[index], taskAddresses2[index], 'Task was changed which should not have been');
    });

}
