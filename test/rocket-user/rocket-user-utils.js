import { RocketSettings } from '../artifacts';
import { scenarioDeposit } from './rocket-user-scenarios';


// Initialise a minipool
export async function initialiseMiniPool({fromAddress}) {
	const rocketSettings = await RocketSettings.deployed();

	 // Get the amount of ether to deposit - enough to launch a minipool
    const minEtherRequired = await rocketSettings.getMiniPoolLaunchAmount.call();
    const sendAmount = parseInt(minEtherRequired.valueOf());

    // Deposit ether to create minipool
    let miniPool = await scenarioDeposit({
        stakingTimeID: 'short',
        fromAddress: fromAddress,
        depositAmount: sendAmount,
        gas: 4800000,
    });

    // Return minipool
    return miniPool;

}

