// Dependencies
import { RocketNodeWatchtower } from '../_lib/artifacts';


// Logout minipool
export async function scenarioLogoutMinipool({minipoolAddress, fromAddress, gas}) {
    const rocketNodeWatchtower = await RocketNodeWatchtower.deployed();

    // Logout
    await rocketNodeWatchtower.logoutMinipool(minipoolAddress, {from: fromAddress, gas: gas});

}


// Withdraw minipool
export async function scenarioWithdrawMinipool({minipoolAddress, balance, fromAddress, gas}) {
    const rocketNodeWatchtower = await RocketNodeWatchtower.deployed();

    // Withdraw
    await rocketNodeWatchtower.withdrawMinipool(minipoolAddress, balance, {from: fromAddress, gas: gas});

}

