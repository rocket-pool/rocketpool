import { RocketSettings, RocketPool } from '../_lib/artifacts'
import { sendDeployValidationContract } from '../_lib/smart-node/validation-code-contract-compiled';
import { scenarioRegisterNode } from './rocket-node-admin/rocket-node-admin-scenarios';
import { scenarioNodeCheckin } from './rocket-node-status/rocket-node-status-scenarios';
import { casperEpochInitialise, casperEpochIncrementAmount } from '../_lib/casper/casper';


// Register nodes and checkin to launch minipools
export async function launchMiniPools({nodeFirst, nodeSecond, nodeRegisterAddress}) {
    const rocketSettings = await RocketSettings.deployed();

    // Initialise Casper epoch to current block number
    await casperEpochInitialise(nodeRegisterAddress);

    // deploy signature validation contract for first node
    let validationFirstTx = await sendDeployValidationContract(nodeFirst);
    let nodeFirstValCodeAddress = validationFirstTx.contractAddress;

    // register first node
    await scenarioRegisterNode({
        nodeAddress: nodeFirst,
        valCodeAddress: nodeFirstValCodeAddress,
        providerID: 'aws',
        subnetID: 'nvirginia',
        instanceID: 'i-1234567890abcdef5',
        regionID: 'usa-east',
        fromAddress: nodeRegisterAddress,
        gas: 1600000
    });

    // deploy signature validation contract for second node
    let validationSecondTx = await sendDeployValidationContract(nodeSecond);
    let nodeSecondValCodeAddress = validationSecondTx.contractAddress;

    // register second node
    await scenarioRegisterNode({
        nodeAddress: nodeSecond,
        valCodeAddress: nodeSecondValCodeAddress,
        providerID: 'rackspace',
        subnetID: 'ohio',
        instanceID: '4325',
        regionID: 'usa-east',
        fromAddress: nodeRegisterAddress,
        gas: 1600000
    });

    // Set minipool countdown time
    await rocketSettings.setMiniPoolCountDownTime(0, {from: web3.eth.coinbase, gas: 500000});

    // Mine to a new epoch
    await casperEpochInitialise(nodeRegisterAddress);
    await casperEpochIncrementAmount(nodeRegisterAddress, 1);

    // Perform checkins - to launch minipools
    await scenarioNodeCheckin({
        averageLoad: web3.toWei('0.5', 'ether'),
        fromAddress: nodeFirst,
    });

    await scenarioNodeCheckin({
        averageLoad: web3.toWei('0.5', 'ether'),
        fromAddress: nodeSecond,
    });

}

