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
export async function rplCalcInflation(daysToSimulate, inflationStartDays, inflationCollectDays, dailyIntervalBlocks, yearlyInflationTarget, txOptions) {

    // Load contracts
    const rocketTokenRPL = await RocketTokenRPL.deployed();

    // Set the daily inflation block count
    await rplInflationIntervalBlocksSet(dailyIntervalBlocks, txOptions);
    // Set the daily inflation rate
    await rplInflationIntervalRateSet(yearlyInflationTarget, txOptions);

    // Get the current block
    let currentBlock = await web3.eth.getBlockNumber();

    // Inflation start block - set to start after 1 day of blocks (add 1 to current block to account for tx setting that start block below)
    const inflationStartBlock = (parseInt(currentBlock)+(inflationStartDays*dailyIntervalBlocks))+1;

    // Set the daily inflation start block
    await rplInflationStartBlockSet(inflationStartBlock, txOptions);

    // Get data about the inflation
    function getInflationData() {
        return Promise.all([
            web3.eth.getBlockNumber(),
            rocketTokenRPL.totalSupply.call(),
            rocketTokenRPL.getInflationIntervalStartBlock.call(),
            rocketTokenRPL.getInlfationIntervalsPassed.call(),
            rocketTokenRPL.inflationCalculate.call(),
            rocketTokenRPL.getInflationIntervalRate.call(),
        ]).then(
            ([currentBlock, tokenTotalSupply, inflationStartBlock, inflationIntervalsPassed, inflationAmount]) =>
            ({currentBlock, tokenTotalSupply, inflationStartBlock, inflationIntervalsPassed, inflationAmount})
        );
    }


    // Loop through the days and check each one
    for(let i=0; i < daysToSimulate; i++) {
        // Get initial data
        let inflationData1 = await getInflationData();
        console.log(inflationData1.currentBlock, web3.utils.fromWei(inflationData1.tokenTotalSupply), inflationData1.inflationStartBlock.toString(), inflationData1.inflationIntervalsPassed.toString(), web3.utils.fromWei(inflationData1.inflationAmount));

        // Process the blocks now to simulate days passing
        await mineBlocks(web3, dailyIntervalBlocks);

        // Collect any inflation if set too 
        if(inflationCollectDays) {
            // Can we collect now?
            if(i % inflationCollectDays == 0) {
                console.log('COLLECT********************');
                // Yes we can
                await rocketTokenRPL.inflationMintTokens(txOptions);
            }
        }
        
        // Get inflation data
        let inflationData2 = await getInflationData();
        console.log(inflationData2.currentBlock, web3.utils.fromWei(inflationData2.tokenTotalSupply), inflationData2.inflationStartBlock.toString(), inflationData2.inflationIntervalsPassed.toString(), web3.utils.fromWei(inflationData2.inflationAmount));
    }


    // Burn tokens & get tx fee
    //let txReceipt = await rocketTokenRPL.swapTokens(amount, txOptions);
    //let txFee = gasPrice.mul(web3.utils.toBN(txReceipt.receipt.gasUsed));



    //console.log(inflationData1.itervalsPassed.toString(), inflationData2.itervalsPassed.toString());

    // Check balances
    //assert(balances2.rplTokenSupply.eq(balances1.rplTokenSupply.add(mintAmount)), 'Incorrect updated token supply');
    //assert(balances2.rplUserBalance.eq(balances1.rplUserBalance.add(mintAmount)), 'Incorrect updated user token balance');
    //assert(balances2.rplContractBalanceOfFixedSupply.eq(balances1.rplContractBalanceOfFixedSupply.add(mintAmount)), 'RPL contract does not contain sent fixed RPL amount');

}

