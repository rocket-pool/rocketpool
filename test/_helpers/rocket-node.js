// Dependencies
import { RocketMinipoolSettings, RocketNodeAPI, RocketNodeContract } from '../_lib/artifacts';
import { mintRpl } from './rocket-pool-token';


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


// Create minipools under a node
export async function createNodeMinipools({nodeContract, stakingDurationID, minipoolCount, nodeOperator, owner}) {

    // Get node deposit amount per minipool created
    let rocketMinipoolSettings = await RocketMinipoolSettings.deployed();
    let miniPoolLaunchAmount = parseInt(await rocketMinipoolSettings.getMinipoolLaunchAmount.call());
    let nodeDepositAmount = Math.floor(miniPoolLaunchAmount / 2);

    // Create minipools
    for (let mi = 0; mi < minipoolCount; ++mi) {

        // Reserve node deposit
        await nodeContract.depositReserve(nodeDepositAmount, stakingDurationID, {from: nodeOperator, gas: 500000});

        // Deposit RPL
        let rplRequired = await nodeContract.getDepositReserveRPLRequired.call();
        await mintRpl({toAddress: nodeContract.address, rplAmount: rplRequired, fromAddress: owner});

        // Complete deposit to create minipool
        await nodeContract.deposit({from: nodeOperator, gas: 7500000, value: nodeDepositAmount});

    }

}

