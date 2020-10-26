import { mineBlocks } from '../_utils/evm';
import { RocketTokenRPL, RocketDAOSettings } from '../_utils/artifacts';



// Get the current inflation period in blocks
export async function rplInflationIntervalBlocksGet(txOptions) {
    // Load contracts
    const rocketTokenRPL = await RocketTokenRPL.deployed();
    return await rocketTokenRPL.getInflationIntervalBlocks.call();
};

// Set the current inflation period in blocks
export async function rplInflationIntervalBlocksSet(intervalBlocks, txOptions) {
    // Load contracts
    const rocketDAOSettings = await RocketDAOSettings.deployed();
    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAOSettings.getInflationIntervalBlocks(),
        ]).then(
            ([inflationIntervalBlocks]) =>
            ({inflationIntervalBlocks})
        );
    }
    // Capture data
    let dataSet1 = await getTxData();
    // Perform tx
    await rocketDAOSettings.setInflationIntervalBlocks(intervalBlocks, txOptions);
    // Capture data
    let dataSet2 = await getTxData();
    // Verify
    assert(dataSet2.inflationIntervalBlocks.eq(web3.utils.toBN(intervalBlocks)), 'Inflation interval blocks not set correctly')
};

// Set the current inflation period in blocks
export async function rplInflationIntervalRateSet(yearlyInflationPerc, txOptions) {
    // Calculate the inflation rate per day
    let dailyInflation = web3.utils.toBN((1 + yearlyInflationPerc) ** (1 / (365)) * 1e18);
    // Load contracts
    const rocketDAOSettings = await RocketDAOSettings.deployed();
    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAOSettings.getInflationIntervalRate(),
        ]).then(
            ([inflationIntervalRate]) =>
            ({inflationIntervalRate})
        );
    }
    // Capture data
    let dataSet1 = await getTxData();
    // Perform tx
    await rocketDAOSettings.setInflationIntervalRate(dailyInflation, txOptions);
    // Capture data
    let dataSet2 = await getTxData();
    // Verify
    assert(dataSet2.inflationIntervalRate.eq(dailyInflation), 'Inflation interval rate not set correctly')
};

// Set the current inflation start block
export async function rplInflationStartBlockSet(startBlock, txOptions) {
    // Load contracts
    const rocketDAOSettings = await RocketDAOSettings.deployed();
    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAOSettings.getInflationIntervalStartBlock(),
        ]).then(
            ([inflationStartBlock]) =>
            ({inflationStartBlock})
        );
    }
    // Capture data
    let dataSet1 = await getTxData();
    // Perform tx
    await rocketDAOSettings.setInflationIntervalStartBlock(startBlock, txOptions);
    // Capture data
    let dataSet2 = await getTxData();
    // Verify
    assert(dataSet2.inflationStartBlock.eq(web3.utils.toBN(startBlock)), 'Start block has not been set correctly')
};

// Calculate the daily inflation over a period
export async function rplCalcInflation(daysToSimulate, dailyIntervalBlocks, yearlyInflationTarget, txOptions) {

    // Load contracts
    const rocketTokenRPL = await RocketTokenRPL.deployed();

    // Set the daily inflation block count
    await rplInflationIntervalBlocksSet(dailyIntervalBlocks, txOptions);
    // Set the daily inflation rate
    await rplInflationIntervalRateSet(yearlyInflationTarget, txOptions);

    // Get the current block
    let startBlock = await web3.eth.getBlockNumber();
    // Find what endblock we should work too
    let endBlock = daysToSimulate * dailyIntervalBlocks;

    // Get data about the inflation
    function getInflationData() {
        return Promise.all([
            web3.eth.getBlockNumber(),
            rocketTokenRPL.getInflationIntervalStartBlock.call(),
            rocketTokenRPL.getInflationIntervalBlocks.call(),
            rocketTokenRPL.getInflationIntervalRate.call(),
            rocketTokenRPL.inflationCalculate.call()
        ]).then(
            ([currentBlock, inflationStartBlock, inflationIntervalBlocks, inflationIntervalRate, inflationAmount]) =>
            ({currentBlock, inflationStartBlock, inflationIntervalBlocks, inflationIntervalRate, inflationAmount})
        );
    }

    // Get initial data
    let inflationData1 = await getInflationData();

    console.log(inflationData1.currentBlock, web3.utils.fromWei(inflationData1.inflationStartBlock), web3.utils.fromWei(inflationData1.inflationIntervalBlocks), web3.utils.fromWei(inflationData1.inflationIntervalRate), web3.utils.fromWei(inflationData1.inflationAmount));

    // Process the blocks now to simulate days passing
    await mineBlocks(web3, endBlock);

    // Get inflation data
    let inflationData2 = await getInflationData();

    console.log(inflationData2.currentBlock, web3.utils.fromWei(inflationData2.inflationStartBlock), web3.utils.fromWei(inflationData2.inflationIntervalBlocks), web3.utils.fromWei(inflationData2.inflationIntervalRate), web3.utils.fromWei(inflationData2.inflationAmount));
 
    // Set gas price
    let gasPrice = web3.utils.toBN(web3.utils.toWei('20', 'gwei'));
    txOptions.gasPrice = gasPrice;

    // Burn tokens & get tx fee
    //let txReceipt = await rocketTokenRPL.swapTokens(amount, txOptions);
    //let txFee = gasPrice.mul(web3.utils.toBN(txReceipt.receipt.gasUsed));



    //console.log(inflationData1.itervalsPassed.toString(), inflationData2.itervalsPassed.toString());

    // Check balances
    //assert(balances2.rplTokenSupply.eq(balances1.rplTokenSupply.add(mintAmount)), 'Incorrect updated token supply');
    //assert(balances2.rplUserBalance.eq(balances1.rplUserBalance.add(mintAmount)), 'Incorrect updated user token balance');
    //assert(balances2.rplContractBalanceOfFixedSupply.eq(balances1.rplContractBalanceOfFixedSupply.add(mintAmount)), 'RPL contract does not contain sent fixed RPL amount');

}

