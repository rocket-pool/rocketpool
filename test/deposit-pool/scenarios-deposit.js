import { RocketDepositPool } from '../_utils/artifacts';


// Make a deposit into the deposit pool
export async function deposit({from, value}) {
    const rocketDepositPool = await RocketDepositPool.deployed();

    // Deposit
    await rocketDepositPool.deposit({from, value});

}

