// Dependencies
import { profileGasUsage } from '../_lib/utils/profiling';
import { RocketMinipoolInterface, RocketMinipoolSettings, RocketNodeAPI, RocketPoolToken } from '../_lib/artifacts';


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

    // Get deposits required
    let nodeDepositEtherRequired = parseInt(await nodeContract.getDepositReserveEtherRequired.call());
    let nodeDepositRPlRequired = parseInt(await nodeContract.getDepositReserveRPLRequired.call());

    // Deposit
    let result = await nodeContract.deposit({from: fromAddress, gas: gas, value: value});
    profileGasUsage('RocketNodeContract.deposit', result);

    // Logs
    let depositMiniPoolETHLogs;
    let depositMiniPoolRPLLogs;

    // Check minipool ether deposits
    if (nodeDepositEtherRequired > 0) {

        // Check deposit events
        depositMiniPoolETHLogs = result.logs.filter(log => (log.event == 'NodeDepositMinipool' && log.args.tokenType == 'ETH'));
        assert.equal(depositMiniPoolETHLogs.length, expectedMiniPools, 'Required number of minipools were not deposited to successfully');

        // Check created minipool balances
        let i, address, miniPool, ethRequired, ethBalance;
        for (i = 0; i < expectedMiniPools; ++i) {
            address = depositMiniPoolETHLogs[i].args._minipool;
            miniPool = await RocketMinipoolInterface.at(address);
            ethRequired = parseInt(await miniPool.getNodeDepositEther.call());
            ethBalance = parseInt(await web3.eth.getBalance(address));
            assert.equal(ethRequired, ethBalance, 'Created minipool has invalid ether balance');
        }

    }

    // Check minipool RPL deposits
    if (nodeDepositRPlRequired > 0) {

        // Check deposit events
        depositMiniPoolRPLLogs = result.logs.filter(log => (log.event == 'NodeDepositMinipool' && log.args.tokenType == 'RPL'));
        assert.equal(depositMiniPoolRPLLogs.length, expectedMiniPools, 'Required number of minipools were not deposited to successfully');

        // Check created minipool balances
        let i, address, miniPool, rplRequired, rplBalance;
        for (i = 0; i < expectedMiniPools; ++i) {
            address = depositMiniPoolRPLLogs[i].args._minipool;
            miniPool = await RocketMinipoolInterface.at(address);
            rplRequired = parseInt(await miniPool.getNodeDepositRPL.call());
            rplBalance = parseInt(await rocketPoolToken.balanceOf.call(address));
            assert.equal(rplRequired, rplBalance, 'Created minipool has invalid RPL balance');
        }

    }

    // Check minipool ether & RPL deposits
    if (nodeDepositEtherRequired > 0 && nodeDepositRPlRequired > 0) {
        depositMiniPoolRPLLogs.forEach((log, index) => {
            assert.equal(depositMiniPoolRPLLogs[index].args._minipool, depositMiniPoolETHLogs[index].args._minipool, 'Deposited minipool addresses do not match');
        });
    }

}


// Attempt a deposit via the node API
export async function scenarioAPIDeposit({nodeOperator}) {
    const rocketNodeAPI = await RocketNodeAPI.deployed();

    // Deposit
    await rocketNodeAPI.deposit(nodeOperator, {from: nodeOperator, gas: 7500000});

}

