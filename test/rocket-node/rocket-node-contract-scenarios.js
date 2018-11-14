// Dependencies
import { profileGasUsage } from '../_lib/utils/profiling';
import { RocketMinipoolInterface, RocketMinipoolSettings, RocketNodeAPI, RocketPool, RocketPoolToken } from '../_lib/artifacts';


// Reserve a deposit
export async function scenarioDepositReserve({nodeContract, amount, durationID, fromAddress, gas}) {

    // Reserve deposit
    let result = await nodeContract.depositReserve(amount, durationID, {from: fromAddress, gas: gas});

    // Get deposit reservation event
    let depositReservationEvents = result.logs.filter(log => (log.event == 'NodeDepositReservation' && log.args._from.toLowerCase() == fromAddress.toLowerCase()));
    let depositReservationEventTime = (depositReservationEvents.length == 1 ? parseInt(depositReservationEvents[0].args.created) : null);

    // Get deposit information
    let reservationExists = await nodeContract.getHasDepositReservation.call();
    let reservationTime = parseInt(await nodeContract.getDepositReservedTime.call());
    let reservationAmount = parseInt(await nodeContract.getDepositReserveEtherRequired.call());
    let reservationDurationID = await nodeContract.getDepositReserveDurationID.call();

    // Asserts
    assert.isTrue(reservationExists, 'Reservation was not created successfully');
    assert.equal(depositReservationEventTime, reservationTime, 'Reservation created time is incorrect');
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
    const rocketPool = await RocketPool.deployed();
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
        let i, address, miniPoolExists, miniPool, ethRequired, ethBalance;
        for (i = 0; i < expectedMiniPools; ++i) {
            address = depositMiniPoolETHLogs[i].args._minipool;
            miniPoolExists = await rocketPool.getPoolExists.call(address);
            miniPool = await RocketMinipoolInterface.at(address);
            ethRequired = parseInt(await miniPool.getNodeDepositEther.call());
            ethBalance = parseInt(await web3.eth.getBalance(address));
            assert.isTrue(miniPoolExists, 'Created minipool does not exist');
            assert.equal(ethRequired, ethBalance, 'Created minipool has invalid ether balance');
        }

    }

    // Check minipool RPL deposits
    if (nodeDepositRPlRequired > 0) {

        // Check deposit events
        depositMiniPoolRPLLogs = result.logs.filter(log => (log.event == 'NodeDepositMinipool' && log.args.tokenType == 'RPL'));
        assert.equal(depositMiniPoolRPLLogs.length, expectedMiniPools, 'Required number of minipools were not deposited to successfully');

        // Check created minipool balances
        let i, address, miniPoolExists, miniPool, rplRequired, rplBalance;
        for (i = 0; i < expectedMiniPools; ++i) {
            address = depositMiniPoolRPLLogs[i].args._minipool;
            miniPoolExists = await rocketPool.getPoolExists.call(address);
            miniPool = await RocketMinipoolInterface.at(address);
            rplRequired = parseInt(await miniPool.getNodeDepositRPL.call());
            rplBalance = parseInt(await rocketPoolToken.balanceOf.call(address));
            assert.isTrue(miniPoolExists, 'Created minipool does not exist');
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


// Withdraw a deposit from a minipool
export async function scenarioWithdrawMinipoolDeposit({nodeContract, minipoolAddress, fromAddress, gas}) {

    // Check if minipool exists
    let minipoolCode = await web3.eth.getCode(minipoolAddress);
    let minipoolExists = (minipoolCode != '0x0');

    // Initialise minipool & get initial minipool status
    let minipool;
    let minipoolNodeDepositExists1 = false;
    let minipoolNodeBalance1 = 0;
    if (minipoolExists) {
        minipool = await RocketMinipoolInterface.at(minipoolAddress);
        minipoolNodeDepositExists1 = await minipool.getNodeDepositExists.call();
        minipoolNodeBalance1 = parseInt(await minipool.getNodeBalance.call());
    }

    // Get initial node contract status
    let nodeContractBalance1 = parseInt(await web3.eth.getBalance(nodeContract.address));

    // Withdraw
    await nodeContract.withdrawMinipoolDeposit(minipoolAddress, {from: fromAddress, gas: gas});

    // Check if minipool still exists after withdrawal
    minipoolCode = await web3.eth.getCode(minipoolAddress);
    minipoolExists = (minipoolCode != '0x0');

    // Get updated minipool status
    let minipoolNodeDepositExists2 = false;
    let minipoolNodeBalance2 = 0;
    if (minipoolExists) {
        minipoolNodeDepositExists2 = await minipool.getNodeDepositExists.call();
        minipoolNodeBalance2 = parseInt(await minipool.getNodeBalance.call());
    }

    // Get updated node contract status
    let nodeContractBalance2 = parseInt(await web3.eth.getBalance(nodeContract.address));

    // Asserts
    assert.equal(minipoolNodeDepositExists1, true, 'Incorrect initial minipool node deposit exists status');
    assert.equal(minipoolNodeDepositExists2, false, 'Incorrect updated minipool node deposit exists status');
    assert.equal(minipoolNodeBalance2, 0, 'Incorrect updated minipool node balance');
    assert.equal(nodeContractBalance2, nodeContractBalance1 + minipoolNodeBalance1, 'Node contract ether balance was not updated correctly');

}


// Withdraw ether from a node contract
export async function scenarioWithdrawNodeEther({nodeContract, amount, fromAddress, gas}) {

    // Get initial ether balances
    let nodeContractBalance1 = parseInt(await nodeContract.getBalanceETH.call());
    let nodeOperatorBalance1 = parseInt(await web3.eth.getBalance(fromAddress));

    // Withdraw ether
    await nodeContract.withdrawEther(amount, {from: fromAddress, gas: gas});

    // Get updated ether balances
    let nodeContractBalance2 = parseInt(await nodeContract.getBalanceETH.call());
    let nodeOperatorBalance2 = parseInt(await web3.eth.getBalance(fromAddress));

    // Asserts
    assert.equal(nodeContractBalance2, nodeContractBalance1 - amount, 'Node contract ether balance was not updated correctly');
    assert.isTrue(nodeOperatorBalance2 > nodeOperatorBalance1, 'Node operator ether balance was not updated correctly');

}


// Withdraw RPL from a node contract
export async function scenarioWithdrawNodeRpl({nodeContract, amount, fromAddress, gas}) {
    const rocketPoolToken = await RocketPoolToken.deployed();

    // Get initial RPL balances
    let nodeContractBalance1 = parseInt(await nodeContract.getBalanceRPL.call());
    let nodeOperatorBalance1 = parseInt(await rocketPoolToken.balanceOf.call(fromAddress));

    // Withdraw RPL
    await nodeContract.withdrawRPL(amount, {from: fromAddress, gas: gas});

    // Get updated RPL balances
    let nodeContractBalance2 = parseInt(await nodeContract.getBalanceRPL.call());
    let nodeOperatorBalance2 = parseInt(await rocketPoolToken.balanceOf.call(fromAddress));

    // Asserts
    assert.equal(nodeContractBalance2, nodeContractBalance1 - amount, 'Node contract RPL balance was not updated correctly');
    assert.equal(nodeOperatorBalance2, nodeOperatorBalance1 + amount, 'Node operator RPL balance was not updated correctly');

}


// Attempt a deposit via the node API
export async function scenarioAPIDeposit({nodeOperator}) {
    const rocketNodeAPI = await RocketNodeAPI.deployed();

    // Deposit
    await rocketNodeAPI.deposit(nodeOperator, {from: nodeOperator, gas: 7500000});

}

