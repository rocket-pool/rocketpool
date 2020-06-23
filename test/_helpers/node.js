import { RocketNodeDeposit, RocketNodeManager } from '../_utils/artifacts';


// Register a node
export async function registerNode(txOptions) {
    const rocketNodeManager = await RocketNodeManager.deployed();
    await rocketNodeManager.registerNode('Australia/Brisbane', txOptions);
}


// Make a node trusted
export async function setNodeTrusted(nodeAddress, txOptions) {
    const rocketNodeManager = await RocketNodeManager.deployed();
    await rocketNodeManager.setNodeTrusted(nodeAddress, true, txOptions);
}


// Make a node deposit
export async function nodeDeposit(txOptions) {
    const rocketNodeDeposit = await RocketNodeDeposit.deployed();
    await rocketNodeDeposit.deposit(web3.utils.toWei('0', 'ether'), txOptions);
}

