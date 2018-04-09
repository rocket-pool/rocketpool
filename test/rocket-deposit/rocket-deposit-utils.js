import { RocketSettings } from '../artifacts';
import { scenarioDeposit } from '../rocket-user/rocket-user-scenarios';
import { scenarioCreateValidationContract } from '../casper/casper-scenarios';
import { scenarioRegisterNode, scenarioNodeCheckin } from '../rocket-node/rocket-node-scenarios';
import { scenarioWithdrawDepositTokens } from './rocket-deposit-scenarios';


// Initialise an address with an RPD balance
export async function initialiseRPDBalance({accountAddress, nodeAddress, nodeRegisterAddress}) {
	const rocketSettings = await RocketSettings.deployed();

	// Get the amount of ether to deposit - enough to launch a minipool
    const minEtherRequired = await rocketSettings.getMiniPoolLaunchAmount.call();
    const sendAmount = parseInt(minEtherRequired.valueOf());

    // Deposit ether to create minipool
    let miniPool = await scenarioDeposit({
        stakingTimeID: 'short',
        fromAddress: accountAddress,
        depositAmount: sendAmount,
        gas: 4800000,
    });

    // Register nodes
    let nodeValCodeAddress = await scenarioCreateValidationContract({fromAddress: nodeAddress});
    await scenarioRegisterNode({
        nodeAddress: nodeAddress,
        valCodeAddress: nodeValCodeAddress,
        providerID: 'aws',
        subnetID: 'nvirginia',
        instanceID: 'i-1234567890abcdef5',
        regionID: 'usa-east',
        fromAddress: nodeRegisterAddress,
        gas: 1600000
    });

    // Set minipool countdown time
    await rocketSettings.setMiniPoolCountDownTime(0, {from: web3.eth.coinbase, gas: 500000});

    // Perform checkins
    await scenarioNodeCheckin({
        averageLoad: web3.toWei('0.5', 'ether'),
        fromAddress: nodeAddress,
    });

    // Withdraw RPD tokens from minipool
    await scenarioWithdrawDepositTokens({
        miniPool: miniPool,
        withdrawalAmount: 0,
        fromAddress: accountAddress,
        gas: 500000,
    });

}

