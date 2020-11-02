import { mineBlocks } from '../_utils/evm';
import { RocketTokenRPL, RocketDAOSettings, RocketVault, RocketRewardsPool } from '../_utils/artifacts';



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
    const rocketVault = await RocketVault.deployed();
    const rocketRewardsPool = await RocketRewardsPool.deployed();

    // Get the previously last inflation calculated block
    const blockIntervalLastCalc = web3.utils.toBN(await rocketTokenRPL.getInflationCalcBlock.call());

    // Get data about the current inflation
    function getInflationData() {
        return Promise.all([
            web3.eth.getBlockNumber(),
            rocketTokenRPL.totalSupply.call(),
            rocketTokenRPL.getInflationIntervalStartBlock.call(),
            rocketTokenRPL.getInlfationIntervalsPassed.call(),
            rocketTokenRPL.balanceOf(rocketVault.address),
            rocketVault.balanceOfToken('rocketRewardsPool', rocketTokenRPL.address),
        ]).then(
            ([currentBlock, tokenTotalSupply, inflationStartBlock, inflationIntervalsPassed, rocketVaultBalanceRPL, rocketVaultInternalBalanceRPL]) =>
            ({currentBlock, tokenTotalSupply, inflationStartBlock, inflationIntervalsPassed, rocketVaultBalanceRPL, rocketVaultInternalBalanceRPL})
        );
    }

    // Get initial data
    let inflationData1 = await getInflationData();
    //console.log(inflationData1.currentBlock, web3.utils.fromWei(inflationData1.tokenTotalSupply), inflationData1.inflationStartBlock.toString(), web3.utils.fromWei(inflationData1.rocketVaultBalanceRPL), web3.utils.fromWei(inflationData1.rocketVaultInternalBalanceRPL));

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
    //console.log(inflationData2.currentBlock, web3.utils.fromWei(inflationData2.tokenTotalSupply), inflationData2.inflationStartBlock.toString(), web3.utils.fromWei(inflationData2.rocketVaultBalanceRPL), web3.utils.fromWei(inflationData2.rocketVaultInternalBalanceRPL));

    // Ending amount of total supply
    let totalSupplyEnd = web3.utils.fromWei(inflationData2.tokenTotalSupply);

    // console.log('RESULT', expectedInflationIntervalsPassed, expectedTokensMinted.toFixed(4), (totalSupplyEnd - totalSupplyStart).toFixed(4));

    // Verify the minted amount is correct based on inflation rate etc
    assert(expectedTokensMinted.toFixed(4) == (totalSupplyEnd - totalSupplyStart).toFixed(4), 'Incorrect amount of minted tokens expected');
    // Verify the minted tokens are now stored in Rocket Vault on behalf of Rocket Rewards Pool
    assert(inflationData2.rocketVaultInternalBalanceRPL.eq(inflationData2.rocketVaultBalanceRPL), 'Incorrect amount of tokens stored in Rocket Vault for Rocket Rewards Pool');
    // Are we verifying an exact amount of tokens given as a required parameter on this pass?
    if(tokenAmountToMatch) assert(Number(tokenAmountToMatch).toFixed(4) == Number(totalSupplyEnd).toFixed(4), 'Given token amount does not match total supply made');

}
