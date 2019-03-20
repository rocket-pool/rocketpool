// Dependencies
import { RocketBETHToken, RocketNodeWatchtower } from '../_lib/artifacts';


// Logout minipool
export async function scenarioLogoutMinipool({minipool, fromAddress, gas}) {
    const rocketNodeWatchtower = await RocketNodeWatchtower.deployed();

    // Get initial minipool status
    let status1 = parseInt(await minipool.getStatus.call());

    // Logout
    await rocketNodeWatchtower.logoutMinipool(minipool.address, {from: fromAddress, gas: gas});

    // Get updated minipool status
    let status2 = parseInt(await minipool.getStatus.call());

    // Asserts
    assert.equal(status1, 2, 'Minipool was not at Staking status before logout');
    assert.equal(status2, 3, 'Minipool was not set to LoggedOut status successfully');

}


// Withdraw minipool
export async function scenarioWithdrawMinipool({minipool, balance, fromAddress, gas}) {
    const rocketNodeWatchtower = await RocketNodeWatchtower.deployed();
    const rocketBETHToken = await RocketBETHToken.deployed();

    // Get initial minipool status
    let status1 = parseInt(await minipool.getStatus.call());
    let rpbBalance1 = parseInt(await rocketBETHToken.balanceOf.call(minipool.address));
    let stakingUserDepositsWithdrawn = parseInt(await minipool.getStakingUserDepositsWithdrawn.call());

    // Withdraw
    await rocketNodeWatchtower.withdrawMinipool(minipool.address, balance, {from: fromAddress, gas: gas});

    // Get updated minipool status
    let status2 = parseInt(await minipool.getStatus.call());
    let rpbBalance2 = parseInt(await rocketBETHToken.balanceOf.call(minipool.address));

    // Get expected RPB increase
    let expectedRpbIncrease = (stakingUserDepositsWithdrawn > parseInt(balance)) ? 0 : parseInt(balance) - stakingUserDepositsWithdrawn;

    // Asserts
    assert.equal(status1, 3, 'Minipool was not at LoggedOut status before withdrawal');
    assert.equal(status2, 4, 'Minipool was not set to Withdrawn status successfully');
    assert.equal(rpbBalance2, rpbBalance1 + expectedRpbIncrease, 'Minipool RPB balance was not increased correctly');

}

