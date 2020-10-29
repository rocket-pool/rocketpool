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


// Claim the inflation after a set amount of blocks have passed
export async function rplClaimInflation(config, txOptions, tokenAmountToMatch = null) {

    // Load contracts
    const rocketTokenRPL = await RocketTokenRPL.deployed();

    // Get the previously set daily inflation rate
    const intervalInflationRate = web3.utils.toBN(await rocketTokenRPL.getInflationIntervalRate.call());
    // Get the previously set start block
    const blockStart = web3.utils.toBN(await rocketTokenRPL.getInflationIntervalStartBlock.call());
    // Get the previously set block interval
    const blockInterval = web3.utils.toBN(await rocketTokenRPL.getInflationIntervalBlocks.call());
    // Get the previously last inflation calculated block
    const blockIntervalLastCalc = web3.utils.toBN(await rocketTokenRPL.getInflationCalcBlock.call());

    // Get data about the current inflation
    function getInflationData() {
        return Promise.all([
            web3.eth.getBlockNumber(),
            rocketTokenRPL.totalSupply.call(),
            rocketTokenRPL.getInflationIntervalStartBlock.call(),
            rocketTokenRPL.getInlfationIntervalsPassed.call(),
            rocketTokenRPL.inflationCalculate.call(),
        ]).then(
            ([currentBlock, tokenTotalSupply, inflationStartBlock, inflationIntervalsPassed, inflationAmount]) =>
            ({currentBlock, tokenTotalSupply, inflationStartBlock, inflationIntervalsPassed, inflationAmount})
        );
    }

    // Get initial data
    let inflationData1 = await getInflationData();
    //console.log(inflationData1.currentBlock, web3.utils.fromWei(inflationData1.tokenTotalSupply), inflationData1.inflationStartBlock.toString(), inflationData1.inflationIntervalsPassed.toString(), web3.utils.fromWei(inflationData1.inflationAmount));

    // Starting amount of total supply
    let totalSupplyStart = web3.utils.fromWei(inflationData1.tokenTotalSupply);

    // Some expected data results based on the passed parameters
    let expectedInflationLastCalcBlock = Number(blockIntervalLastCalc) == 0 && config.blockStart < config.blockClaim ? config.blockStart : Number(blockIntervalLastCalc);
    let expectedInflationIntervalsPassed = Math.floor((config.blockClaim - expectedInflationLastCalcBlock) / config.blockInterval);
    let expectedInflationDaily = (1 + config.yearlyInflationTarget) ** (1 / (365));
    // How much inflation to use based on intervals passed
    let expectedInflationAmount = expectedInflationDaily;
    for(let i=1; i < expectedInflationIntervalsPassed; i++) {
        expectedInflationAmount = (expectedInflationAmount * expectedInflationDaily);
    }
    // How many tokens to be epected minted
    let expectedTokensMinted = (expectedInflationAmount * totalSupplyStart) - totalSupplyStart;
   

    // Get the current block so we can calculate how many blocks to mine to make it to the claim block
    let blockCurrent = await web3.eth.getBlockNumber();
    // Blocks to process as passing
    let blocksToSimulatePassing = config.blockClaim - blockCurrent;
     // Process the blocks now to simulate blocks passing (nned to minus 1 block as the 'inflationMintTokens' tx triggers a new block with ganache which is equal to the claim block)
     await mineBlocks(web3, blocksToSimulatePassing-1);  
    // Claim tokens now
    await rocketTokenRPL.inflationMintTokens(txOptions);


    // Get inflation data
    let inflationData2 = await getInflationData();
    //console.log(inflationData2.currentBlock, web3.utils.fromWei(inflationData2.tokenTotalSupply), inflationData2.inflationStartBlock.toString(), inflationData2.inflationIntervalsPassed.toString(), web3.utils.fromWei(inflationData2.inflationAmount));

    // Ending amount of total supply
    let totalSupplyEnd = web3.utils.fromWei(inflationData2.tokenTotalSupply);

    //console.log('RESULT', expectedInflationIntervalsPassed, expectedTokensMinted.toFixed(4), (totalSupplyEnd - totalSupplyStart).toFixed(4));

    // Verify the minted amount is correct based on inflation rate etc
    assert(expectedTokensMinted.toFixed(4) == (totalSupplyEnd - totalSupplyStart).toFixed(4), 'Incorrect amount of minted tokens expected');
    // Are we verifying an exact amount of tokens given as a required parameter on this pass?
    if(tokenAmountToMatch) assert(Number(tokenAmountToMatch).toFixed(4) == Number(totalSupplyEnd).toFixed(4), 'Given token amount does not match total supply made');

}
