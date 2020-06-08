import { RocketNodeDeposit } from '../_utils/artifacts';


// Make a node deposit
export async function deposit(txOptions) {

    // Load contracts
    const rocketNodeDeposit = await RocketNodeDeposit.deployed();

    // Deposit
    await rocketNodeDeposit.deposit(txOptions);

}

