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


// Add a node task
export async function scenarioAddNodeTask({taskAddress, fromAddress, gas}) {
    const rocketNodeTasks = await RocketNodeTasks.deployed();

    // Get initial task address list
    let taskAddresses1 = await getTaskAddresses();

    // Add task
    await rocketNodeTasks.add(taskAddress, {from: fromAddress, gas: gas});

    // Get updated task address list
    let taskAddresses2 = await getTaskAddresses();

    // Asserts
    assert.equal(taskAddresses2.length, taskAddresses1.length + 1, 'Task list count was not updated correctly');
    assert.notEqual(taskAddresses2.indexOf(taskAddress), -1, 'Task was not added correctly');
    taskAddresses1.forEach((address) => {
        assert.notEqual(taskAddresses2.indexOf(address), -1, 'Task was removed which should not have been');
    });

}
