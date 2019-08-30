// Dependencies
import { RocketNodeTasks, RocketStorage, TestNodeTask } from '../_lib/artifacts';


// Create a test node task contract
export async function createTestNodeTaskContract({name, owner}) {

    // Get storage
    let rocketStorage = await RocketStorage.deployed();

    // Create and return test node task contract
    let nodeTask = await TestNodeTask.new(rocketStorage.address, name, {from: owner});
    return nodeTask;

}


// Add a node task
export async function addNodeTask({taskAddress, owner}) {
    let rocketNodeTasks = await RocketNodeTasks.deployed();
    await rocketNodeTasks.add(taskAddress, {from: owner});
}


// Remove a node task
export async function removeNodeTask({taskAddress, owner}) {
    let rocketNodeTasks = await RocketNodeTasks.deployed();
    await rocketNodeTasks.remove(taskAddress, {from: owner});
}


// Update a node task
export async function updateNodeTask({oldAddress, newAddress, owner}) {
    let rocketNodeTasks = await RocketNodeTasks.deployed();
    await rocketNodeTasks.update(oldAddress, newAddress, {from: owner});
}

