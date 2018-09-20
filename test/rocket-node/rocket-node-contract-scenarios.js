// Dependencies
import { RocketMinipoolInterface, RocketMinipoolSettings, RocketPoolToken } from '../_lib/artifacts';


// Reserve a deposit
export async function scenarioDepositReserve({nodeContract, amount, durationID, fromAddress, gas}) {

    // Reserve deposit
    await nodeContract.depositReserve(amount, durationID, {from: fromAddress, gas: gas});

    // Get deposit information
    let reservationExists = await nodeContract.getHasDepositReservation.call();
    let reservationAmount = parseInt(await nodeContract.getDepositReserveEtherRequired.call());
    let reservationDurationID = await nodeContract.getDepositReserveDurationID.call();

    // Asserts
    assert.isTrue(reservationExists, 'Reservation was not created successfully');
    assert.equal(reservationAmount, amount, 'Reservation amount is incorrect');
    assert.equal(reservationDurationID, durationID, 'Reservation duration ID is incorrect');

}


// Cancel a deposit reservation
export async function scenarioDepositReserveCancel({nodeContract, fromAddress, gas}) {

    // Cancel deposit reservation
    await nodeContract.depositReserveCancel({from: fromAddress, gas: gas});

    // Check deposit
    let reservationExists;
    try { await nodeContract.getHasDepositReservation.call(); }
    catch (e) { reservationExists = false; }

    // Asserts 
    assert.isTrue(reservationExists === false, 'Reservation was not cancelled successfully');

}


// Perform a deposit
export async function scenarioDeposit({nodeContract, value, fromAddress, gas}) {
    const rocketMinipoolSettings = await RocketMinipoolSettings.deployed();
    const rocketPoolToken = await RocketPoolToken.deployed();

    // Get expected minipools created
    let miniPoolLaunchAmount = parseInt(await rocketMinipoolSettings.getMinipoolLaunchAmount.call());
    let miniPoolCreationAmount = Math.floor(miniPoolLaunchAmount / 2);
    let expectedMiniPools = Math.floor(value / miniPoolCreationAmount);

    // Deposit
    let result = await nodeContract.deposit({from: fromAddress, gas: gas, value: value});

    // Check deposited minipool count
    let depositMiniPoolRPLLogs = result.logs.filter(log => (log.event == 'NodeDepositMinipool' && log.args.tokenType == 'RPL'));
    let depositMiniPoolETHLogs = result.logs.filter(log => (log.event == 'NodeDepositMinipool' && log.args.tokenType == 'ETH'));
    assert.equal(depositMiniPoolRPLLogs.length, expectedMiniPools, 'Required number of minipools were not deposited to successfully');
    assert.equal(depositMiniPoolETHLogs.length, expectedMiniPools, 'Required number of minipools were not deposited to successfully');
    depositMiniPoolRPLLogs.forEach((log, index) => {
        assert.equal(depositMiniPoolRPLLogs[index].args._minipool, depositMiniPoolETHLogs[index].args._minipool, 'Deposited minipool addresses do not match');
    });

    // Check created minipool balances
    let i, address, miniPool, ethRequired, rplRequired, ethBalance, rplBalance;
    for (i = 0; i < expectedMiniPools; ++i) {
        address = depositMiniPoolRPLLogs[i].args._minipool;
        miniPool = await RocketMinipoolInterface.at(address);
        ethRequired = parseInt(await miniPool.getNodeDepositEther.call());
        rplRequired = parseInt(await miniPool.getNodeDepositRPL.call());
        ethBalance = parseInt(await web3.eth.getBalance(address));
        rplBalance = parseInt(await rocketPoolToken.balanceOf.call(address));
        assert.equal(ethRequired, ethBalance, 'Created minipool has invalid ether balance');
        assert.equal(rplRequired, rplBalance, 'Created minipool has invalid RPL balance');
    }

}
