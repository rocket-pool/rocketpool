// Dependencies
import { RocketNodeAPI, RocketNodeContract } from '../_lib/artifacts';


// Create a new node contract
export async function createNodeContract({timezone, nodeOperator}) {

    // Create node contract
    let rocketNodeAPI = await RocketNodeAPI.deployed();
    let nodeAddResult = await rocketNodeAPI.add(timezone, {from: nodeOperator, gas: 7500000});

    // Get & return node contract instance
    let nodeContractAddress = nodeAddResult.logs.filter(log => (log.event == 'NodeAdd'))[0].args.contractAddress;
    let nodeContract = await RocketNodeContract.at(nodeContractAddress);
    return nodeContract;

}

