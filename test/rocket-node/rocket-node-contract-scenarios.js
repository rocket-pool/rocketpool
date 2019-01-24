// Dependencies
import { getTransactionContractEvents } from '../_lib/utils/general';
import { profileGasUsage } from '../_lib/utils/profiling';
import { RocketMinipool, RocketMinipoolSettings, RocketNodeAPI, RocketPool, RocketPoolToken } from '../_lib/artifacts';


// Reserve a deposit
export async function scenarioDepositReserve({nodeContract, durationID, depositInput, fromAddress, gas}) {

    // Reserve deposit
    let result = await nodeContract.depositReserve(durationID, depositInput, {from: fromAddress, gas: gas});

    // Get deposit reservation event
    let depositReservationEvents = result.logs.filter(log => (log.event == 'NodeDepositReservation' && log.args._from.toLowerCase() == fromAddress.toLowerCase()));
    let depositReservationEventTime = (depositReservationEvents.length == 1 ? parseInt(depositReservationEvents[0].args.created) : null);

    // Get deposit information
    let reservationExists = await nodeContract.getHasDepositReservation.call();
    let reservationTime = parseInt(await nodeContract.getDepositReservedTime.call());
    let reservationDurationID = await nodeContract.getDepositReserveDurationID.call();

    // Asserts
    assert.isTrue(reservationExists, 'Reservation was not created successfully');
    assert.equal(depositReservationEventTime, reservationTime, 'Reservation created time is incorrect');
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

    // Get deposits required
    let nodeDepositEtherRequired = parseInt(await nodeContract.getDepositReserveEtherRequired.call());
    let nodeDepositRPlRequired = parseInt(await nodeContract.getDepositReserveRPLRequired.call());

    // Deposit
    let result = await nodeContract.deposit({from: fromAddress, gas: gas, value: value});
    profileGasUsage('RocketNodeContract.deposit', result);

    // Get current block
    let blockNumber = await web3.eth.getBlockNumber();

    // Get minipool created events
    let minipoolCreatedEvents = getTransactionContractEvents(result, rocketPool.address, 'PoolCreated', [
        {type: 'address', name: '_address', indexed: true},
        {type: 'string',  name: '_durationID', indexed: true},
        {type: 'uint256', name: 'created'},
    ]);

    // Check minipool created events
    assert.equal(minipoolCreatedEvents.length, 1, 'Minipool was not created');

    // Get minipool
    let minipoolAddress = minipoolCreatedEvents[0]._address;
    let minipool = await RocketMinipool.at(minipoolAddress);

    // Get minipool details
    let minipoolExists = await rocketPool.getPoolExists.call(minipoolAddress);
    let minipoolNodeContract = await minipool.getNodeContract.call();
    let minipoolStatusChangedBlock = parseInt(await minipool.getStatusChangedBlock.call());
    let minipoolStakingDurationID = await minipool.getStakingDurationID.call();
    let minipoolStakingDuration = parseInt(await minipool.getStakingDuration.call());

    // Get minipool balance requirements & balances
    let ethRequired = parseInt(await minipool.getNodeDepositEther.call());
    let rplRequired = parseInt(await minipool.getNodeDepositRPL.call());
    let ethBalance = parseInt(await web3.eth.getBalance(minipoolAddress));
    let rplBalance = parseInt(await rocketPoolToken.balanceOf.call(minipoolAddress));

    // Get settings
    let expectedStakingDuration = parseInt(await rocketMinipoolSettings.getMinipoolStakingDuration.call(minipoolStakingDurationID));

    // Asserts
    assert.isTrue(minipoolExists, 'Created minipool does not exist');
    assert.equal(minipoolNodeContract.toLowerCase(), nodeContract.address.toLowerCase(), 'Incorrect minipool node contract address');
    assert.equal(minipoolStatusChangedBlock, blockNumber, 'Incorrect minipool status block number');
    assert.equal(minipoolStakingDuration, expectedStakingDuration, 'Incorrect minipool staking duration');
    assert.equal(ethRequired, ethBalance, 'Created minipool has invalid ether balance');
    assert.equal(rplRequired, rplBalance, 'Created minipool has invalid RPL balance');

    // Get minipool deposit events
    let depositMiniPoolETHLogs = result.logs.filter(log => (log.event == 'NodeDepositMinipool' && log.args.tokenType == 'ETH'));
    let depositMiniPoolRPLLogs = result.logs.filter(log => (log.event == 'NodeDepositMinipool' && log.args.tokenType == 'RPL'));

    // Check minipool deposit events
    assert.equal(depositMiniPoolETHLogs.length, (nodeDepositEtherRequired > 0 ? 1 : 0), 'ether was not deposited to minipool successfully');
    assert.equal(depositMiniPoolRPLLogs.length, (nodeDepositRPlRequired > 0 ? 1 : 0), 'RPL was not deposited to minipool successfully');
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
    let minipoolExists = (minipoolCode != '0x0' && minipoolCode != '0x');

    // Initialise minipool & get initial minipool status
    let minipool;
    let minipoolNodeDepositExists1 = false;
    let minipoolNodeBalance1 = 0;
    if (minipoolExists) {
        minipool = await RocketMinipool.at(minipoolAddress);
        minipoolNodeDepositExists1 = await minipool.getNodeDepositExists.call();
        minipoolNodeBalance1 = parseInt(await minipool.getNodeBalance.call());
    }

    // Get initial node contract status
    let nodeContractBalance1 = parseInt(await web3.eth.getBalance(nodeContract.address));

    // Withdraw
    await nodeContract.withdrawMinipoolDeposit(minipoolAddress, {from: fromAddress, gas: gas});

    // Check if minipool still exists after withdrawal
    minipoolCode = await web3.eth.getCode(minipoolAddress);
    minipoolExists = (minipoolCode != '0x0' && minipoolCode != '0x');

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

