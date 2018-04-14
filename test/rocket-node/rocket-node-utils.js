import { RocketSettings, RocketPool } from '../artifacts';
import { scenarioIncrementEpoch, scenarioIncrementDynasty, scenarioCreateValidationContract } from '../casper/casper-scenarios';
import { scenarioRegisterNode, scenarioNodeCheckin } from './rocket-node-scenarios';


// Register nodes and checkin to launch minipools
export async function launchMiniPools({nodeFirst, nodeSecond, nodeRegisterAddress}) {
    const rocketSettings = await RocketSettings.deployed();

    // Register nodes
    let nodeFirstValCodeAddress = await scenarioCreateValidationContract({fromAddress: nodeFirst});
    let nodeSecondValCodeAddress = await scenarioCreateValidationContract({fromAddress: nodeSecond});
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

    // Perform checkins
    await scenarioNodeCheckin({
        averageLoad: web3.toWei('0.5', 'ether'),
        fromAddress: nodeFirst,
    });
    await scenarioNodeCheckin({
        averageLoad: web3.toWei('0.5', 'ether'),
        fromAddress: nodeSecond,
    });

}


// Set staking durations, checkin and advance Casper to log minipools out of Casper
export async function logoutMiniPools({miniPools, nodeFirst, nodeSecond, fromAddress}) {
    const rocketPool = await RocketPool.deployed();

    // Set minipool staking durations
    await rocketPool.setPoolStakingDuration(miniPools.first.address, 0, {from: fromAddress, gas: 150000});
    await rocketPool.setPoolStakingDuration(miniPools.second.address, 0, {from: fromAddress, gas: 150000});

    // Perform checkins
    await scenarioNodeCheckin({
        averageLoad: web3.toWei('0.5', 'ether'),
        fromAddress: nodeFirst,
    });
    await scenarioNodeCheckin({
        averageLoad: web3.toWei('0.5', 'ether'),
        fromAddress: nodeSecond,
    });

    // Step casper forward
    await scenarioIncrementEpoch(fromAddress);
    await scenarioIncrementEpoch(fromAddress);
    await scenarioIncrementDynasty(fromAddress);
    await scenarioIncrementEpoch(fromAddress);
    await scenarioIncrementDynasty(fromAddress);
    await scenarioIncrementEpoch(fromAddress);
    await scenarioIncrementDynasty(fromAddress);
    await scenarioIncrementEpoch(fromAddress);
    await scenarioIncrementEpoch(fromAddress);

    // Perform checkins
    await scenarioNodeCheckin({
        averageLoad: web3.toWei('0.5', 'ether'),
        fromAddress: nodeFirst,
    });
    await scenarioNodeCheckin({
        averageLoad: web3.toWei('0.5', 'ether'),
        fromAddress: nodeSecond,
    });

}

